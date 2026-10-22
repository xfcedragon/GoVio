/**
 * Pure auth rules shared by the web app, its tests, and the Expo app.
 * This module must not read the service-role key or import Next.js.
 */

export const PUBLIC_SUPABASE_URL = "NEXT_PUBLIC_SUPABASE_URL"
export const PUBLIC_SUPABASE_ANON_KEY = "NEXT_PUBLIC_SUPABASE_ANON_KEY"
export const PUBLIC_SITE_URL = "NEXT_PUBLIC_SITE_URL"
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

export type AuthActionState = {
  status: "idle" | "error" | "check-email"
  message: string
  fieldErrors: FieldErrors
}

export const initialAuthState: AuthActionState = {
  status: "idle",
  message: "",
  fieldErrors: {},
}

export const EXISTING_ACCOUNT_MESSAGE =
  "An account with this email already exists. Sign in, or reset the password."

/**
 * With email confirmation on, Supabase answers an already-registered address
 * with an empty identities list and no error. A new signup includes an identity.
 */
export function existingSignUpAccountMessage(identities: unknown): string | null {
  if (!Array.isArray(identities) || identities.length > 0) return null
  return EXISTING_ACCOUNT_MESSAGE
}

export type SignupPendingConfirmation = {
  message: string
  visitId: number
  documentId: string
}

/**
 * The check-email panel is only for the submission that just succeeded.
 * A pending confirmation stored under another document (a reload) or another
 * visit (leave /signup and come back) is ignored, and the form is shown.
 */
export function signupConfirmationScreen(input: {
  pending: SignupPendingConfirmation | null
  visitId: number
  documentId: string
}): { mode: "form" } | { mode: "check-email"; message: string } {
  const pending = input.pending
  if (!pending || pending.message.length === 0) return { mode: "form" }
  if (pending.documentId !== input.documentId || pending.visitId !== input.visitId) return { mode: "form" }
  return { mode: "check-email", message: pending.message }
}

export type ProfileActionState = {
  status: "idle" | "error" | "saved"
  message: string
}

export const initialProfileState: ProfileActionState = {
  status: "idle",
  message: "",
}

/** Example values from `.env.example` are not a project. They must not turn sign-in on. */
export function isPlaceholderSecret(value: string): boolean {
  const upper = value.toUpperCase()
  return upper.includes("YOUR_PROJECT_REF") || upper.includes("YOUR_SUPABASE") || upper.includes("YOUR_ANON")
}

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

/** True only when both public web values are real. Placeholders and the service-role key do not count. */
export function isSupabaseConfigured(env: EnvLike): boolean {
  const url = readEnv(env, PUBLIC_SUPABASE_URL)
  const anonKey = readEnv(env, PUBLIC_SUPABASE_ANON_KEY)
  if (!url || !anonKey) return false
  if (isPlaceholderSecret(url) || isPlaceholderSecret(anonKey)) return false
  return true
}

export function publicSupabaseConfig(env: EnvLike): { url: string; anonKey: string } | null {
  if (!isSupabaseConfigured(env)) return null
  return {
    url: readEnv(env, PUBLIC_SUPABASE_URL),
    anonKey: readEnv(env, PUBLIC_SUPABASE_ANON_KEY),
  }
}

export function isExpoSupabaseConfigured(env: EnvLike): boolean {
  const url = readEnv(env, EXPO_SUPABASE_URL)
  const anonKey = readEnv(env, EXPO_SUPABASE_ANON_KEY)
  if (!url || !anonKey) return false
  if (isPlaceholderSecret(url) || isPlaceholderSecret(anonKey)) return false
  return true
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

/** Used only when the Host header is missing or not a URL. Production hosts never fall through to this. */
const UNUSABLE_HOST_ORIGIN = "http://127.0.0.1:43127"

function isBindAllHostname(hostname: string): boolean {
  const value = hostname.trim().toLowerCase()
  return value === "0.0.0.0" || value === "::" || value === "[::]" || value === "*"
}

function configuredSiteOrigin(value: string): string | null {
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (url.username || url.password) return null
  if (isBindAllHostname(url.hostname)) url.hostname = "127.0.0.1"
  return url.origin
}

function hostForUrl(host: string): string | null {
  const value = host.trim()
  if (!value || /[\s/\\@,]/.test(value)) return null
  if (value === "::" || value === "0:0:0:0:0:0:0:0") return "[::]"
  return value
}

function originFromHost(host: string | null | undefined, forwardedProto: string | null | undefined): string {
  const normalized = host ? hostForUrl(host) : null
  if (!normalized) return UNUSABLE_HOST_ORIGIN
  let url: URL
  try {
    url = new URL(`http://${normalized}`)
  } catch {
    return UNUSABLE_HOST_ORIGIN
  }
  const bindAll = isBindAllHostname(url.hostname)
  if (bindAll) url.hostname = "127.0.0.1"
  const hostname = url.hostname.toLowerCase()
  const local = bindAll || hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]" || hostname === "::1"
  url.protocol = !local && forwardedProto === "https" ? "https:" : "http:"
  return url.origin
}

/**
 * Origin for auth email links and the callback's next hop.
 * `NEXT_PUBLIC_SITE_URL` wins when it is an absolute http(s) origin.
 * If it is unset, the request host is used. Bind-all hosts (`0.0.0.0`, `::`)
 * are rewritten to `127.0.0.1` with the same port. Any other host is kept.
 */
export function siteOrigin(input: {
  env?: EnvLike
  host?: string | null
  forwardedProto?: string | null
} = {}): string {
  const configured = configuredSiteOrigin(readEnv(input.env ?? {}, PUBLIC_SITE_URL))
  if (configured) return configured
  return originFromHost(input.host, input.forwardedProto)
}

/** Absolute `/auth/callback` on `origin`. A next path other than `/` is kept as `next`. */
export function authCallbackUrl(origin: string, nextPath: string): string {
  const callback = new URL("/auth/callback", origin)
  if (nextPath !== "/") callback.searchParams.set("next", nextPath)
  return callback.toString()
}

/** Signup and password-reset redirect Supabase should put in the email. */
export function emailConfirmationRedirect(input: {
  env?: EnvLike
  host?: string | null
  forwardedProto?: string | null
  nextPath?: string
} = {}): string {
  const nextPath = input.nextPath && input.nextPath.length > 0 ? input.nextPath : "/"
  return authCallbackUrl(siteOrigin(input), nextPath)
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

/**
 * Supabase appends `error`, `error_code`, and `error_description` when a mail link fails.
 * `otp_expired` is the expired-link case. Any other error is a failed verification, not a session.
 */
export function authLinkErrorCode(input: {
  error?: string | null
  errorCode?: string | null
  description?: string | null
}): "expired" | "callback" | null {
  const error = (input.error ?? "").trim().toLowerCase()
  const code = (input.errorCode ?? "").trim().toLowerCase()
  const description = (input.description ?? "").trim().toLowerCase()
  if (!error && !code && !description) return null
  if (code === "otp_expired" || code.includes("expired") || description.includes("expired") || error.includes("expired")) {
    return "expired"
  }
  return "callback"
}

export function isExpiredAuthFailure(error: AuthFailure | null | undefined): boolean {
  if (!error) return false
  const message = (error.message ?? "").toLowerCase()
  const code = (error.code ?? "").toLowerCase()
  return code === "otp_expired" || code.includes("expired") || message.includes("expired")
}

/**
 * Pure form of `auth.uid() = user_id` (and `auth.uid() = id` on profiles).
 * A session for one user cannot satisfy this for a different owner id.
 */
export function sessionOwnsRow(sessionUserId: string | null | undefined, rowOwnerId: string | null | undefined): boolean {
  if (!sessionUserId || !rowOwnerId) return false
  return sessionUserId === rowOwnerId
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
  // A stale cookie is not an expired mail link. otp_expired stays on the link message.
  if (intent === "session" && failure === "expired" && code !== "otp_expired") {
    return LOGIN_ERRORS.session ?? "Your session has expired. Sign in again."
  }
  if (failure === "expired" || code === "otp_expired") {
    return "This link has expired. Request a new one."
  }
  if (code === "over_request_rate_limit" || message.includes("rate limit")) {
    return "Too many attempts. Wait a moment and try again."
  }
  if (intent === "sign-up" && (message.includes("already registered") || message.includes("already been registered"))) {
    return EXISTING_ACCOUNT_MESSAGE
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

export function asAuthFailure(error: unknown): AuthFailure {
  if (typeof error === "object" && error !== null) {
    const record = error as AuthFailure
    return {
      message: typeof record.message === "string" ? record.message : undefined,
      code: typeof record.code === "string" ? record.code : undefined,
      status: typeof record.status === "number" ? record.status : undefined,
      name: typeof record.name === "string" ? record.name : undefined,
    }
  }
  return { message: "Failed to fetch", status: 0, name: "TypeError" }
}

/** Login query code for a session problem. Mail-link expiry stays `expired`. */
export function loginCodeForSessionFailure(failure: SessionFailure | null): "network" | "session" | "config" | null {
  if (failure === "expired") return "session"
  if (failure === "network" || failure === "config") return failure
  return null
}

export type ProtectedRouteDecision = {
  action: "continue" | "redirect"
  pathname: string
  search: string
  hash: string
}

function splitDestination(value: string): { pathname: string; search: string; hash: string } {
  const hashAt = value.indexOf("#")
  const hash = hashAt === -1 ? "" : value.slice(hashAt)
  const beforeHash = hashAt === -1 ? value : value.slice(0, hashAt)
  const queryAt = beforeHash.indexOf("?")
  const pathname = (queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt)) || "/"
  const search = queryAt === -1 ? "" : beforeHash.slice(queryAt)
  return { pathname, search, hash }
}

/**
 * Where the proxy sends this request. Unconfigured installs stay on the ledger.
 * Unsigned dashboard visits go to /login?next=<same-origin path>. Signed-in
 * visits to /login and /signup follow a safe next path. External and
 * protocol-relative next values fall back to /.
 */
export function protectedRouteDecision(input: {
  configured: boolean
  pathname: string
  search: string
  next: string | null
  userId: string | null
  failure: SessionFailure | null
}): ProtectedRouteDecision {
  const stay: ProtectedRouteDecision = {
    action: "continue",
    pathname: input.pathname,
    search: input.search,
    hash: "",
  }
  if (!input.configured) return stay
  if (input.pathname.startsWith("/api/") || input.pathname.startsWith("/auth/")) return stay

  const signedIn = Boolean(input.userId)
  if (isDashboardPath(input.pathname) && !signedIn) {
    const params = new URLSearchParams()
    const code = loginCodeForSessionFailure(input.failure)
    if (code) params.set("error", code)
    const nextTarget = safeNextPath(`${input.pathname}${input.search}`)
    if (nextTarget) params.set("next", nextTarget)
    return {
      action: "redirect",
      pathname: "/login",
      search: params.size ? `?${params.toString()}` : "",
      hash: "",
    }
  }

  if (signedIn && isSignedInEntryPath(input.pathname)) {
    return { action: "redirect", ...splitDestination(destinationAfterAuth(input.next)) }
  }

  return stay
}
