import { NextResponse } from "next/server"
import { isAccountDeletionConfigured } from "@/lib/account-deletion"
import { authErrorMessage, isSupabaseConfigured } from "@/lib/auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status })
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")
  const host = request.headers.get("host")
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function missingBucket(error: { message?: string; statusCode?: string } | null): boolean {
  const message = (error?.message ?? "").toLowerCase()
  return message.includes("bucket not found") || (error?.statusCode === "404" && message.includes("bucket"))
}

async function removeReceiptPrefix(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createSupabaseAdminClient()
  if (!admin) return { ok: false, error: "Account deletion is unavailable until the server-only service role key is set." }
  const bucket = admin.storage.from("receipts")
  const folders = [userId]
  const seen = new Set<string>()
  const files: string[] = []

  while (folders.length > 0) {
    const prefix = folders.pop()
    if (!prefix || seen.has(prefix)) continue
    seen.add(prefix)
    let offset = 0
    while (true) {
      const { data, error } = await bucket.list(prefix, { limit: 100, offset })
      if (error) {
        if (missingBucket(error)) return { ok: true }
        return { ok: false, error: "Could not list private receipt files. The account was not deleted." }
      }
      const batch = data ?? []
      for (const entry of batch) {
        if (!entry.name || entry.name === "." || entry.name === "..") continue
        const path = `${prefix}/${entry.name}`
        if (entry.id) files.push(path)
        else folders.push(path)
      }
      if (batch.length < 100) break
      offset += batch.length
      if (files.length > 5000) {
        return { ok: false, error: "Too many receipt files to remove in one request. The account was not deleted." }
      }
    }
  }

  for (let index = 0; index < files.length; index += 100) {
    const slice = files.slice(index, index + 100)
    const { error } = await bucket.remove(slice)
    if (error) return { ok: false, error: "Could not remove private receipt files. The account was not deleted." }
  }
  return { ok: true }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return jsonError("Account deletion must be requested from this site.", 403)
  if (!isSupabaseConfigured(process.env)) return jsonError("Account sign-in is not configured.", 503)
  if (!isAccountDeletionConfigured(process.env)) {
    return jsonError(
      "Account deletion is unavailable until the server-only service role key is set. The ledger in this browser was not changed.",
      503,
    )
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) return jsonError("Account sign-in is not configured.", 503)
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return jsonError(error ? authErrorMessage(error, "session") : "Your session has expired. Sign in again.", 401)
  }

  const cleanup = await removeReceiptPrefix(data.user.id)
  if (!cleanup.ok) return jsonError(cleanup.error, 502)

  const admin = createSupabaseAdminClient()
  if (!admin) {
    return jsonError(
      "Account deletion is unavailable until the server-only service role key is set. The ledger in this browser was not changed.",
      503,
    )
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id)
  if (deleteError) {
    return jsonError("The account service could not delete this user. The account was not deleted.", 502)
  }

  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}
