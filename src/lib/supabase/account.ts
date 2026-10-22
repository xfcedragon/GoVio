import "server-only"

import { connection } from "next/server"
import { isAccountDeletionConfigured } from "@/lib/account-deletion"
import type { AccountSnapshot } from "@/lib/account-snapshot"
import { authErrorMessage, isSupabaseConfigured } from "@/lib/auth"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export type { AccountSnapshot }

function missingSession(error: { message?: string; name?: string } | null): boolean {
  if (!error) return true
  const message = (error.message ?? "").toLowerCase()
  const name = (error.name ?? "").toLowerCase()
  return name === "authsessionmissingerror" || message.includes("auth session missing")
}

export async function loadAccount(): Promise<AccountSnapshot> {
  await connection()
  if (!isSupabaseConfigured(process.env)) return { status: "unconfigured" }
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { status: "unconfigured" }

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    if (!error || missingSession(error)) return { status: "signed-out" }
    return { status: "error", message: authErrorMessage(error, "session") }
  }

  const deletionAvailable = isAccountDeletionConfigured(process.env)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", data.user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return {
      status: "signed-in",
      email: data.user.email ?? "",
      fullName: "",
      profileWritable: false,
      profileMessage: "The profile row is missing. Apply the database migrations before editing the account name.",
      deletionAvailable,
    }
  }

  return {
    status: "signed-in",
    email: profile.email || data.user.email || "",
    fullName: profile.full_name ?? "",
    profileWritable: true,
    profileMessage: null,
    deletionAvailable,
  }
}

export async function loadResetSession(): Promise<{
  configured: boolean
  sessionReady: boolean
  email: string | null
  message: string | null
}> {
  await connection()
  if (!isSupabaseConfigured(process.env)) {
    return { configured: false, sessionReady: false, email: null, message: null }
  }
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { configured: false, sessionReady: false, email: null, message: null }
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return {
      configured: true,
      sessionReady: false,
      email: null,
      message:
        !error || missingSession(error)
          ? "This reset link is invalid or has expired. Request a new one."
          : authErrorMessage(error, "session"),
    }
  }
  return { configured: true, sessionReady: true, email: data.user.email ?? null, message: null }
}
