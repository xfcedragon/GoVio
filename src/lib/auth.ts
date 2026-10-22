/**
 * Pure auth rules shared by the web app, its tests, and the Expo app.
 * This module must not read the service-role key or import Next.js.
 */

export const PUBLIC_SUPABASE_URL = "NEXT_PUBLIC_SUPABASE_URL"
export const PUBLIC_SUPABASE_ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY"
export const EXPO_SUPABASE_URL = "EXPO_PUBLIC_SUPABASE_URL"
export const EXPO_SUPABASE_ANON_KEY = "EXPO_PUBLIC_SUPABASE_ANON_KEY"

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 72
export const MAX_NAME_LENGTH = 80

export type EnvLike = Record<string, string | undefined>

export type FieldErrors = {
  email?: string
  password?: string
  confirmPassword?: string
  fullName?: string
}

export type AuthFailure = {
  message?: string
  code?: string
  status?: number
  name?: string
}

export type SessionFailure = "network" | "expired" | "config"

const EMAIL = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i

const LOGIN_ERRORS: Record<string, string> = {
  unconfigured: "Account sign-in is not configured.",
  credentials: "Email or password is incorrect.",
  unverified: "This email is not verified yet. Open the confirmation link, then sign in.",
  expired: "This link has expired. Request a new one.",
  network: "Could not reach the account service. Check your connection and try again.",
  callback: "The confirmation link could not be verified. Request a new one.",
  session: "Your session has expired. Sign in again.",
  config: "Account sign-in is not configured correctly. Check the Supabase URL and anon key.",
}

const AUTH_LOOP = new Set(["/login", "/signup", "/forgot-password", "/auth/callback"])

export function readEnv(env: EnvLike, name: string): string {
  const value = env[name]
  return typeof value === "string" ? value.trim() : ""
}

/** True only when both public web values are non-empty. The service-role key is not part of this check. */
export function isSupabaseConfigured(env: EnvLike): boolean {
  return readEnv(env, PUBLIC_SUPABASE_URL).length > 0 && readEnv(env, PUBLIC_SUPABASE_ANON_KEY).length > 0
}

export function publicSupabaseConfig(env: EnvLike): { url: string; anonKey: string } | null {
  if (!isSupabaseConfigured(env)) return null
  return {
    url: readEnv(env, PUBLIC_SUPABASE_URL),
    anonKey: readEnv(env, PUBLIC_SUPABASE_ANON_KEY),
  }
}

export function isExpoSupabaseConfigured(env: EnvLike): boolean {
  return readEnv(env, EXPO_SUPABASE_URL).length > 0 && readEnv(env, EXPO_SUPABASE_ANON_KEY).length > 0
}

export function publicExpoConfig(env: EnvLike): { url: string; anonKey: string } | null {
  if (!isExpoSupabaseConfigured(env)) return null
  return {
    url: readEnv(env, EXPO_SUPABASE_URL),
    anonKey: readEnv(env, EXPO_SUPABASE_ANON_KEY),
  }
}

export function validateEmail(value: string): string | null {
  const email = value.trim()
  if (!email) return "Enter an email address."
  if (email.length > 254 || email.includes("..") || !EMAIL.test(email)) return "Enter a valid email address."
  return null
}

export function validatePassword(value: string): string | null {
  if (!value) return "Enter a password."
  if (value.length < MIN_PASSWORD_LENGTH) return "Use at least 8 characters."
  if (value.length > MAX_PASSWORD_LENGTH) return "Use at most 72 characters."
  return null
}

export function validateFullName(value: string): string | null {
  const name = value.trim()
  if (!name) return "Enter your name."
  if (name.length > MAX_NAME_LENGTH) return "Use 80 characters or fewer."
  if (/[\u0000-\u001F\u007F]/.test(name)) return "Name contains characters that cannot be saved."
  return null
}

export function validateSignUp(input: {
  email: string
  password: string
  confirmPassword: string
  fullName: string
}): FieldErrors | null {
  const errors: FieldErrors = {}
  const email = validateEmail(input.email)
  const password = validatePassword(input.password)
  const fullName = validateFullName(input.fullName)
  if (email) errors.email = email
  if (password) errors.password = password
  if (!input.confirmPassword) errors.confirmPassword = "Confirm your password."
  else if (input.password !== input.confirmPassword) errors.confirmPassword = "Passwords do not match."
  if (fullName) errors.fullName = fullName
  return Object.keys(errors).length > 0 ? errors : null
}

export function validateSignIn(input: { email: string; password: string }): FieldErrors | null {
  const errors: FieldErrors = {}
  const email = validateEmail(input.email)
  if (email) errors.email = email
  if (!input.password) errors.password = "Enter a password."
  return Object.keys(errors).length > 0 ? errors : null
}

export function validateForgotPassword(email: string): FieldErrors | null {
  const message = validateEmail(email)
  return message ? { email: message } : null
}

export function validatePasswordReset(input: { password: string; confirmPassword: string }): FieldErrors | null {
  const errors: FieldErrors = {}
  const password = validatePassword(input.password)
  if (password) errors.password = password
  if (!input.confirmPassword) errors.confirmPassword = "Confirm your password."
  else if (input.password !== input.confirmPassword) errors.confirmPassword = "Passwords do not match."
  return Object.keys(errors).length > 0 ? errors : null
}

function isSafePath(value: string): boolean {
  if (value.length === 0 || value.length > 2048) return false
  if (!value.startsWith("/")) return false
  if (value.startsWith("//")) return false
  if (value.startsWith("/\\")) return false
  if (value.includes("\\")) return false
  if (value.includes("://")) return false
  if (/[\u0000-\u001F\u007F]/.test(value)) return false
  if (/^\/[^/?#]*:/.test(value)) return false
  return true
}

/** Same-origin path only. Rejects protocol-relative, external, and encoded bypasses. */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!isSafePath(trimmed)) return null
  let current = trimmed
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let decoded: string
    try {
      decoded = decodeURIComponent(current)
    } catch {
      return null
    }
    if (decoded === current) break
    if (!isSafePath(decoded)) return null
    current = decoded
  }
  return trimmed
}

/** Where to send someone who just authenticated. Auth pages fall back to the ledger. */
export function destinationAfterAuth(value: unknown): string {
  const safe = safeNextPath(value)
  if (!safe) return "/"
  const path = safe.split(/[?#]/)[0] || "/"
  if (AUTH_LOOP.has(path)) return "/"
  return safe
}

export function firstQueryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export function loginBanner(code: string): string | null {
  if (!code) return null
  return Object.prototype.hasOwnProperty.call(LOGIN_ERRORS, code)
    ? LOGIN_ERRORS[code] ?? "Sign-in did not succeed."
    : "Sign-in did not succeed."
}

export function loginNotice(code: string): string | null {
  if (code === "deleted") {
    return "The account was deleted. Records in this browser were left on this device."
  }
  return null
}

export function sessionFailure(error: AuthFailure | null | undefined): SessionFailure | null {
  if (!error) return null
  const message = (error.message ?? "").toLowerCase()
  const code = (error.code ?? "").toLowerCase()
  const name = (error.name ?? "").toLowerCase()
  if (name === "authsessionmissingerror" || message.includes("auth session missing")) return null
  if (message.includes("invalid api key") || code === "invalid_api_key" || message.includes("no api key")) {
    return "config"
  }
  if (
    message.includes("expired") ||
    code.includes("expired") ||
    message.includes("invalid jwt") ||
    message.includes("invalid token") ||
    code === "refresh_token_not_found" ||
    name.includes("invalidjwt")
  ) {
    return "expired"
  }
  if (
    name.includes("retry") ||
    name.includes("fetch") ||
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    error.status === 0
  ) {
    return "network"
  }
  return null
}

export function authErrorMessage(error: AuthFailure, intent: "sign-in" | "sign-up" | "reset" | "callback" | "session"): string {
  const failure = sessionFailure(error)
  if (failure === "network") return LOGIN_ERRORS.network ?? "Could not reach the account service."
  if (failure === "config") return LOGIN_ERRORS.config ?? "Account sign-in is not configured correctly."
  const message = (error.message ?? "").toLowerCase()
  const code = (error.code ?? "").toLowerCase()
  if (code === "email_not_confirmed" || message.includes("email not confirmed") || message.includes("not confirmed")) {
    return "This email is not verified yet. Open the confirmation link, then sign in."
  }
  if (code === "invalid_credentials" || message.includes("invalid login credentials") || message.includes("invalid email or password")) {
    return "Email or password is incorrect."
  }
  if (failure === "expired" || code === "otp_expired") {
    return "This link has expired. Request a new one."
  }
  if (code === "over_request_rate_limit" || message.includes("rate limit")) {
    return "Too many attempts. Wait a moment and try again."
  }
  if (intent === "sign-up" && (message.includes("already registered") || message.includes("already been registered"))) {
    return "An account with this email already exists. Sign in, or reset the password."
  }
  if ((intent === "sign-up" || intent === "reset") && (code === "weak_password" || message.includes("password"))) {
    return "Choose a password of at least 8 characters."
  }
  if (intent === "callback") return "The confirmation link could not be verified. Request a new one."
  if (intent === "session") return "Your session has expired. Sign in again."
  return "The account service rejected the request. Nothing was changed."
}

export function isDashboardPath(pathname: string): boolean {
  if (pathname === "/") return true
  return ["/shifts", "/fuel", "/hourly", "/bills", "/vehicle", "/settings"].some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  )
}

export function isSignedInEntryPath(pathname: string): boolean {
  return pathname === "/login" || pathname === "/signup"
}
