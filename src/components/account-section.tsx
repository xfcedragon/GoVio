"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { textLinkClass } from "@/components/field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { logoutAction, updateProfileNameAction } from "@/lib/auth-actions"
import { initialProfileState } from "@/lib/auth"
import type { AccountSnapshot } from "@/lib/account-snapshot"

function SaveNameButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="h-8 px-3" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : "Save account name"}
    </Button>
  )
}

function LogoutControl() {
  const [state, action] = useActionState(logoutAction, null)
  return (
    <form action={action} className="space-y-2">
      {state?.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <LogoutButton />
    </form>
  )
}

function LogoutButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="outline" className="h-8 px-3" disabled={pending} aria-busy={pending}>
      {pending ? "Signing out…" : "Log out"}
    </Button>
  )
}

function SignedInAccount({
  account,
}: {
  account: Extract<AccountSnapshot, { status: "signed-in" }>
}) {
  const [name, setName] = useState(account.fullName)
  const [profileState, saveName] = useActionState(updateProfileNameAction, initialProfileState)
  const [confirmText, setConfirmText] = useState("")
  const [checked, setChecked] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()
  const ready = checked && confirmText === "DELETE"

  async function deleteAccount() {
    setDeleteError(null)
    if (!ready) {
      setDeleteError("Check the box and type DELETE. The account was not deleted.")
      return
    }
    setDeleting(true)
    try {
      const response = await fetch("/api/account", { method: "DELETE", cache: "no-store" })
      const body = (await response.json().catch(() => null)) as { ok?: unknown; error?: unknown } | null
      if (!response.ok || !body || body.ok !== true) {
        setDeleteError(typeof body?.error === "string" ? body.error : "Account deletion did not succeed.")
        setDeleting(false)
        return
      }
      router.push("/login?notice=deleted")
      router.refresh()
    } catch {
      setDeleteError("Could not reach the account service. The account was not deleted.")
      setDeleting(false)
    }
  }

  return (
    <section className="max-w-xl space-y-4 rounded-md border border-border bg-card p-3">
      <div>
        <h2 className="text-base font-semibold">Account</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Account email: <span className="text-foreground">{account.email || "No email on this session."}</span>
        </p>
      </div>

      {account.profileWritable ? (
        <form action={saveName} className="space-y-3">
          <div className="grid gap-1.5">
            <Label htmlFor="account-name">Account name</Label>
            <Input
              id="account-name"
              name="fullName"
              className="h-10"
              value={name}
              maxLength={80}
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Saved on the profile row. The display name below stays on this device and is not uploaded.
            </p>
          </div>
          {profileState?.message ? (
            <p role={profileState.status === "error" ? "alert" : "status"} className={profileState.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              {profileState.message}
            </p>
          ) : null}
          <SaveNameButton />
        </form>
      ) : (
        <p role="status" className="text-sm leading-6 text-muted-foreground">
          {account.profileMessage}
        </p>
      )}

      <p className="text-sm leading-6 text-muted-foreground">
        Moving this browser&apos;s ledger into the account is not available yet. You will review the records and
        confirm before each one is inserted with your user id. Sample data is not included. Receipt photos and any
        GPS traces stay private, and nothing is uploaded now.
      </p>

      <LogoutControl />

      <div className="space-y-3 border-t border-border pt-3">
        <h3 className="text-sm font-medium">Delete account</h3>
        {account.deletionAvailable ? (
          <>
            <p className="text-sm leading-6 text-muted-foreground">
              This permanently deletes the GoVio auth user, the profile, owned rows, and private receipt files.
              It does not erase the ledger stored in this browser.
            </p>
            <label className="flex items-start gap-2 text-sm leading-5" htmlFor="delete-confirm-check">
              <input
                id="delete-confirm-check"
                type="checkbox"
                className="mt-1"
                checked={checked}
                onChange={(event) => setChecked(event.target.checked)}
              />
              <span>I understand this permanently deletes the account for {account.email || "this session"}.</span>
            </label>
            <div className="grid gap-1.5">
              <Label htmlFor="delete-confirm-text">Type DELETE to confirm</Label>
              <Input
                id="delete-confirm-text"
                className="h-10"
                value={confirmText}
                autoComplete="off"
                onChange={(event) => setConfirmText(event.target.value)}
              />
            </div>
            {deleteError ? (
              <p role="alert" className="text-sm text-destructive">
                {deleteError}
              </p>
            ) : null}
            <Button
              type="button"
              variant="destructive"
              className="h-8 px-3"
              disabled={!ready || deleting}
              aria-busy={deleting}
              onClick={() => void deleteAccount()}
            >
              {deleting ? "Deleting…" : "Delete account"}
            </Button>
          </>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            Permanent deletion is unavailable until the server-only service role key is set. This does not delete
            the account, and it does not clear the ledger in this browser.
          </p>
        )}
      </div>
    </section>
  )
}

export function AccountSection({ account }: { account: AccountSnapshot }) {
  if (account.status === "unconfigured") {
    return (
      <section className="max-w-xl rounded-md border border-border bg-card p-3">
        <h2 className="text-base font-semibold">Account</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Account sign-in is not configured. Add the Supabase URL and anon key to turn it on. This browser&apos;s
          ledger still works, and nothing on this page is uploaded.
        </p>
        <Link href="/login" className={`${textLinkClass} mt-3 inline-block`}>
          Account sign-in
        </Link>
      </section>
    )
  }

  if (account.status === "error") {
    return (
      <section className="max-w-xl rounded-md border border-border bg-card p-3">
        <h2 className="text-base font-semibold">Account</h2>
        <p role="alert" className="mt-1 text-sm leading-6 text-destructive">
          {account.message}
        </p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">GoVio could not confirm a session.</p>
      </section>
    )
  }

  if (account.status === "signed-out") {
    return (
      <section className="max-w-xl rounded-md border border-border bg-card p-3">
        <h2 className="text-base font-semibold">Account</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">No session was found for this browser.</p>
        <Link href="/login?next=/settings" className={`${textLinkClass} mt-3 inline-block`}>
          Sign in
        </Link>
      </section>
    )
  }

  return <SignedInAccount account={account} />
}
