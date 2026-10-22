"use client"

import { useState } from "react"
import Link from "next/link"
import { useFormStatus } from "react-dom"
import { textLinkClass } from "@/components/field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  forgotPasswordAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
} from "@/lib/auth-actions"
import {
  initialAuthState,
  validateForgotPassword,
  validatePasswordReset,
  validateSignIn,
  validateSignUp,
  type AuthActionState,
  type FieldErrors,
} from "@/lib/auth"
import { useActionState } from "react"

function SubmitButton({ idle, pending }: { idle: string; pending: string }) {
  const { pending: busy } = useFormStatus()
  return (
    <Button type="submit" className="h-10 px-3" disabled={busy} aria-busy={busy}>
      {busy ? pending : idle}
    </Button>
  )
}

function PasswordField({
  id,
  name,
  label,
  hint,
  error,
  autoComplete,
  value,
  onChange,
}: {
  id: string
  name: string
  label: string
  hint?: string
  error?: string
  autoComplete: string
  value: string
  onChange: (value: string) => void
}) {
  const [visible, setVisible] = useState(false)
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? "Hide password" : "Show password"}
        </button>
      </div>
      <Input
        id={id}
        name={name}
        className="h-10"
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        maxLength={72}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs leading-5 text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function TextField({
  id,
  name,
  label,
  type,
  autoComplete,
  value,
  onChange,
  error,
  maxLength,
}: {
  id: string
  name: string
  label: string
  type: string
  autoComplete: string
  value: string
  onChange: (value: string) => void
  error?: string
  maxLength: number
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        className="h-10"
        type={type}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function FormMessage({ state, clientInvalid }: { state: AuthActionState | null | undefined; clientInvalid: boolean }) {
  if (clientInvalid || !state?.message) return null
  if (state.status === "check-email") {
    return (
      <p role="status" className="text-sm leading-5 text-foreground">
        {state.message}
      </p>
    )
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="text-sm leading-5 text-destructive">
        {state.message}
      </p>
    )
  }
  return null
}

function withNext(path: string, nextPath: string) {
  if (!nextPath || nextPath === "/") return path
  return `${path}?next=${encodeURIComponent(nextPath)}`
}

function Unconfigured() {
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-medium tracking-tight">Account sign-in is not configured</h1>
      <p className="text-sm leading-5 text-muted-foreground">
        GoVio has no Supabase URL or anon key in this environment, so this page cannot sign anyone in. The
        ledger in this browser still works.
      </p>
      <Link href="/" className={textLinkClass}>
        Back to the ledger
      </Link>
    </div>
  )
}

function SignInForm({ nextPath, error, notice }: { nextPath: string; error: string | null; notice: string | null }) {
  const [state, action] = useActionState(signInAction, initialAuthState)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [clientErrors, setClientErrors] = useState<FieldErrors>({})
  const clientInvalid = Object.keys(clientErrors).length > 0
  const errors = clientInvalid ? clientErrors : (state?.fieldErrors ?? {})

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">Use the email and password for your GoVio account.</p>
      </div>
      {notice ? <p role="status" className="text-sm leading-5 text-muted-foreground">{notice}</p> : null}
      {error ? <p role="alert" className="text-sm leading-5 text-destructive">{error}</p> : null}
      {state.status === "check-email" ? (
        <FormMessage state={state} clientInvalid={clientInvalid} />
      ) : (
        <form
          action={action}
          className="space-y-4 rounded-md border border-border bg-card p-4"
          noValidate
          onSubmit={(event) => {
            const nextErrors = validateSignIn({ email, password })
            if (nextErrors) {
              event.preventDefault()
              setClientErrors(nextErrors)
              return
            }
            setClientErrors({})
          }}
        >
          <input type="hidden" name="next" value={nextPath} />
          <TextField id="login-email" name="email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} error={errors.email} maxLength={254} />
          <PasswordField id="login-password" name="password" label="Password" autoComplete="current-password" value={password} onChange={setPassword} error={errors.password} />
          <FormMessage state={state} clientInvalid={clientInvalid} />
          <SubmitButton idle="Sign in" pending="Signing in…" />
        </form>
      )}
      <p className="text-sm text-muted-foreground">
        <Link href="/forgot-password" className={textLinkClass}>Forgot password</Link>
        <span aria-hidden="true"> · </span>
        <Link href={withNext("/signup", nextPath)} className={textLinkClass}>Create an account</Link>
      </p>
    </div>
  )
}

function SignUpForm({ nextPath }: { nextPath: string }) {
  const [state, action] = useActionState(signUpAction, initialAuthState)
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [clientErrors, setClientErrors] = useState<FieldErrors>({})
  const clientInvalid = Object.keys(clientErrors).length > 0
  const errors = clientInvalid ? clientErrors : (state?.fieldErrors ?? {})

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Create an account</h1>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          Supabase sends the confirmation email. Opening that link verifies the address.
        </p>
      </div>
      {state.status === "check-email" ? (
        <div className="space-y-3 rounded-md border border-border bg-card p-4">
          <FormMessage state={state} clientInvalid={false} />
          <Link href={withNext("/login", nextPath)} className={textLinkClass}>Back to sign in</Link>
        </div>
      ) : (
        <form
          action={action}
          className="space-y-4 rounded-md border border-border bg-card p-4"
          noValidate
          onSubmit={(event) => {
            const nextErrors = validateSignUp({ email, password, confirmPassword, fullName })
            if (nextErrors) {
              event.preventDefault()
              setClientErrors(nextErrors)
              return
            }
            setClientErrors({})
          }}
        >
          <input type="hidden" name="next" value={nextPath} />
          <TextField id="signup-name" name="fullName" label="Full name" type="text" autoComplete="name" value={fullName} onChange={setFullName} error={errors.fullName} maxLength={80} />
          <TextField id="signup-email" name="email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} error={errors.email} maxLength={254} />
          <PasswordField id="signup-password" name="password" label="Password" hint="At least 8 characters." autoComplete="new-password" value={password} onChange={setPassword} error={errors.password} />
          <PasswordField id="signup-confirm" name="confirmPassword" label="Confirm password" autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} error={errors.confirmPassword} />
          <FormMessage state={state} clientInvalid={clientInvalid} />
          <SubmitButton idle="Create account" pending="Creating account…" />
        </form>
      )}
      {state.status === "check-email" ? null : (
        <p className="text-sm text-muted-foreground">
          <Link href={withNext("/login", nextPath)} className={textLinkClass}>Already have an account</Link>
        </p>
      )}
    </div>
  )
}

function ForgotForm() {
  const [state, action] = useActionState(forgotPasswordAction, initialAuthState)
  const [email, setEmail] = useState("")
  const [clientErrors, setClientErrors] = useState<FieldErrors>({})
  const clientInvalid = Object.keys(clientErrors).length > 0
  const errors = clientInvalid ? clientErrors : (state?.fieldErrors ?? {})

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Reset password</h1>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          We send a link if this address can receive mail. The link opens a page to choose a new password.
        </p>
      </div>
      {state.status === "check-email" ? (
        <div className="space-y-3 rounded-md border border-border bg-card p-4">
          <FormMessage state={state} clientInvalid={false} />
          <Link href="/login" className={textLinkClass}>Back to sign in</Link>
        </div>
      ) : (
        <form
          action={action}
          className="space-y-4 rounded-md border border-border bg-card p-4"
          noValidate
          onSubmit={(event) => {
            const nextErrors = validateForgotPassword(email)
            if (nextErrors) {
              event.preventDefault()
              setClientErrors(nextErrors)
              return
            }
            setClientErrors({})
          }}
        >
          <TextField id="forgot-email" name="email" label="Email" type="email" autoComplete="email" value={email} onChange={setEmail} error={errors.email} maxLength={254} />
          <FormMessage state={state} clientInvalid={clientInvalid} />
          <SubmitButton idle="Send reset link" pending="Sending…" />
        </form>
      )}
      {state.status === "check-email" ? null : (
        <p className="text-sm">
          <Link href="/login" className={textLinkClass}>Back to sign in</Link>
        </p>
      )}
    </div>
  )
}

function ResetForm({ email, blocked }: { email: string | null; blocked: string | null }) {
  const [state, action] = useActionState(resetPasswordAction, initialAuthState)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [clientErrors, setClientErrors] = useState<FieldErrors>({})
  const clientInvalid = Object.keys(clientErrors).length > 0
  const errors = clientInvalid ? clientErrors : (state?.fieldErrors ?? {})

  if (blocked) {
    return (
      <div className="space-y-3">
        <h1 className="text-lg font-medium tracking-tight">Reset password</h1>
        <p role="alert" className="text-sm leading-5 text-destructive">{blocked}</p>
        <Link href="/forgot-password" className={textLinkClass}>Request a new link</Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-medium tracking-tight">Choose a new password</h1>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">
          {email ? `This reset session is for ${email}.` : "This reset session is ready."} It came from the link in your email.
        </p>
      </div>
      <form
        action={action}
        className="space-y-4 rounded-md border border-border bg-card p-4"
        noValidate
        onSubmit={(event) => {
          const nextErrors = validatePasswordReset({ password, confirmPassword })
          if (nextErrors) {
            event.preventDefault()
            setClientErrors(nextErrors)
            return
          }
          setClientErrors({})
        }}
      >
        <PasswordField id="reset-password" name="password" label="New password" hint="At least 8 characters." autoComplete="new-password" value={password} onChange={setPassword} error={errors.password} />
        <PasswordField id="reset-confirm" name="confirmPassword" label="Confirm password" autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} error={errors.confirmPassword} />
        <FormMessage state={state} clientInvalid={clientInvalid} />
        <SubmitButton idle="Update password" pending="Updating…" />
      </form>
    </div>
  )
}

export function AuthPanel({
  mode,
  configured,
  nextPath,
  error,
  notice,
  resetReady = false,
  resetEmail = null,
  resetBlockedMessage = null,
}: {
  mode: "login" | "signup" | "forgot" | "reset"
  configured: boolean
  nextPath: string
  error: string | null
  notice: string | null
  resetReady?: boolean
  resetEmail?: string | null
  resetBlockedMessage?: string | null
}) {
  if (!configured) return <Unconfigured />
  if (mode === "signup") return <SignUpForm nextPath={nextPath} />
  if (mode === "forgot") return <ForgotForm />
  if (mode === "reset") {
    return (
      <ResetForm
        email={resetEmail}
        blocked={resetReady ? null : resetBlockedMessage || "This reset link is invalid or has expired. Request a new one."}
      />
    )
  }
  return <SignInForm nextPath={nextPath} error={error} notice={notice} />
}
