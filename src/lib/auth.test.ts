import assert from "node:assert/strict"
import { test } from "node:test"
import { isAccountDeletionConfigured, SERVICE_ROLE_ENV } from "@/lib/account-deletion"
import {
  authErrorMessage,
  authLinkErrorCode,
  destinationAfterAuth,
  initialAuthState,
  isExpoSupabaseConfigured,
  isSupabaseConfigured,
  loginBanner,
  loginCodeForSessionFailure,
  protectedRouteDecision,
  safeNextPath,
  sessionFailure,
  sessionOwnsRow,
  validateSignUp,
} from "@/lib/auth"

const configured = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
}

test("sign-up validation accepts a complete form", () => {
  assert.equal(
    validateSignUp({
      email: "ada@example.com",
      password: "correct-horse",
      confirmPassword: "correct-horse",
      fullName: "Ada Lovelace",
    }),
    null,
  )
})

test("sign-up validation rejects a missing name, a bad email, a short password, and a mismatch", () => {
  const errors = validateSignUp({
    email: "not-an-email",
    password: "short",
    confirmPassword: "other",
    fullName: "   ",
  })
  assert.ok(errors)
  assert.equal(errors.fullName, "Enter your name.")
  assert.equal(errors.email, "Enter a valid email address.")
  assert.equal(errors.password, "Use at least 8 characters.")
  assert.equal(errors.confirmPassword, "Passwords do not match.")
})

test("sign-up validation accepts 8 characters and rejects 7 or a too-long password", () => {
  assert.equal(
    validateSignUp({
      email: "ada@example.com",
      password: "12345678",
      confirmPassword: "12345678",
      fullName: "Ada",
    }),
    null,
  )
  assert.equal(
    validateSignUp({
      email: "ada@example.com",
      password: "1234567",
      confirmPassword: "1234567",
      fullName: "Ada",
    })?.password,
    "Use at least 8 characters.",
  )
  const long = "a".repeat(73)
  assert.equal(
    validateSignUp({
      email: "ada@example.com",
      password: long,
      confirmPassword: long,
      fullName: "Ada",
    })?.password,
    "Use at most 72 characters.",
  )
})

test("safe redirect paths allow ledger routes and deny external or protocol-relative targets", () => {
  assert.equal(safeNextPath("/"), "/")
  assert.equal(safeNextPath("/shifts"), "/shifts")
  assert.equal(safeNextPath("/settings?tab=1"), "/settings?tab=1")
  assert.equal(safeNextPath("/vehicle#mileage"), "/vehicle#mileage")
  assert.equal(safeNextPath("  /fuel  "), "/fuel")
  assert.equal(safeNextPath("/login"), "/login")

  assert.equal(safeNextPath("https://evil.example/phish"), null)
  assert.equal(safeNextPath("http://127.0.0.1:43127/"), null)
  assert.equal(safeNextPath("//evil.example"), null)
  assert.equal(safeNextPath("///evil.example"), null)
  assert.equal(safeNextPath("/\\evil.example"), null)
  assert.equal(safeNextPath("\\\\evil.example"), null)
  assert.equal(safeNextPath("/%2f%2fevil.example"), null)
  assert.equal(safeNextPath("/%5Cevil.example"), null)
  assert.equal(safeNextPath("/javascript:alert(1)"), null)
  assert.equal(safeNextPath("/\n/shifts"), null)
  assert.equal(safeNextPath("shifts"), null)
  assert.equal(safeNextPath(""), null)
  assert.equal(safeNextPath(null), null)
})

test("post-auth destinations drop auth pages and unsafe next values", () => {
  assert.equal(destinationAfterAuth("/shifts"), "/shifts")
  assert.equal(destinationAfterAuth("/reset-password"), "/reset-password")
  assert.equal(destinationAfterAuth("/login"), "/")
  assert.equal(destinationAfterAuth("/signup?next=/settings"), "/")
  assert.equal(destinationAfterAuth("//evil.example"), "/")
  assert.equal(destinationAfterAuth(undefined), "/")
})

test("a session cannot satisfy ownership for someone else's id", () => {
  const alice = "11111111-1111-1111-1111-111111111111"
  const bob = "22222222-2222-2222-2222-222222222222"
  assert.equal(sessionOwnsRow(alice, alice), true)
  assert.equal(sessionOwnsRow(alice, bob), false)
  assert.equal(sessionOwnsRow(bob, alice), false)
  assert.equal(sessionOwnsRow(null, alice), false)
  assert.equal(sessionOwnsRow("", bob), false)
  assert.equal(sessionOwnsRow(alice, null), false)
})

test("example placeholders do not configure sign-in or account deletion", () => {
  assert.equal(
    isSupabaseConfigured({
      NEXT_PUBLIC_SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
    }),
    false,
  )
  assert.equal(
    isSupabaseConfigured({
      NEXT_PUBLIC_SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "YOUR_SUPABASE_PUBLISHABLE_KEY",
    }),
    false,
  )
  assert.equal(
    isExpoSupabaseConfigured({
      EXPO_PUBLIC_SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
      EXPO_PUBLIC_SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
    }),
    false,
  )
  assert.equal(
    isAccountDeletionConfigured({
      ...configured,
      SUPABASE_SERVICE_ROLE_KEY: "YOUR_SUPABASE_SERVICE_ROLE_KEY",
    }),
    false,
  )
  assert.equal(initialAuthState.fieldErrors.email, undefined)
  assert.equal(initialAuthState.status, "idle")
})

test("expired mail links are distinct from a generic callback failure", () => {
  assert.equal(
    authLinkErrorCode({
      error: "access_denied",
      errorCode: "otp_expired",
      description: "Email link is invalid or has expired",
    }),
    "expired",
  )
  assert.equal(authLinkErrorCode({ error: "server_error", errorCode: null, description: null }), "callback")
  assert.equal(authLinkErrorCode({ error: null, errorCode: null, description: null }), null)
})

test("supabase configured detection requires both public web values and ignores the service role", () => {
  assert.equal(isSupabaseConfigured(configured), true)
  assert.equal(isSupabaseConfigured({ ...configured, SUPABASE_SERVICE_ROLE_KEY: "" }), true)
  assert.equal(isSupabaseConfigured({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" }), false)
  assert.equal(isSupabaseConfigured({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key" }), false)
  assert.equal(
    isSupabaseConfigured({
      NEXT_PUBLIC_SUPABASE_URL: "   ",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    }),
    false,
  )
  assert.equal(isSupabaseConfigured({}), false)
})

test("expo configured detection uses only the public expo names", () => {
  assert.equal(
    isExpoSupabaseConfigured({
      EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    }),
    true,
  )
  assert.equal(isExpoSupabaseConfigured(configured), false)
})

test("account deletion is configured only when the server key is present with the public values", () => {
  assert.equal(SERVICE_ROLE_ENV.includes("NEXT_PUBLIC"), false)
  assert.equal(SERVICE_ROLE_ENV.includes("EXPO_PUBLIC"), false)
  assert.equal(
    isAccountDeletionConfigured({ ...configured, SUPABASE_SERVICE_ROLE_KEY: "service-role" }),
    true,
  )
  assert.equal(isAccountDeletionConfigured(configured), false)
  assert.equal(isAccountDeletionConfigured({ SUPABASE_SERVICE_ROLE_KEY: "service-role" }), false)
  assert.equal(
    isAccountDeletionConfigured({ ...configured, SUPABASE_SERVICE_ROLE_KEY: "  " }),
    false,
  )
})

test("session and credential errors stay specific", () => {
  assert.equal(sessionFailure({ name: "AuthSessionMissingError", message: "Auth session missing!" }), null)
  assert.equal(sessionFailure({ message: "Failed to fetch", status: 0 }), "network")
  assert.equal(sessionFailure({ code: "invalid_api_key", message: "Invalid API key" }), "config")
  assert.equal(sessionFailure({ message: "JWT expired" }), "expired")
  assert.equal(
    authErrorMessage({ code: "invalid_credentials", message: "Invalid login credentials" }, "sign-in"),
    "Email or password is incorrect.",
  )
  assert.equal(
    authErrorMessage({ code: "email_not_confirmed", message: "Email not confirmed" }, "sign-in"),
    "This email is not verified yet. Open the confirmation link, then sign in.",
  )
})

test("a placeholder on either public value leaves sign-in unconfigured", () => {
  assert.equal(
    isSupabaseConfigured({
      NEXT_PUBLIC_SUPABASE_URL: "https://your_project_ref.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    }),
    false,
  )
  assert.equal(
    isSupabaseConfigured({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "your_supabase_anon_key",
    }),
    false,
  )
})

test("unverified, bad credentials, expired session, expired link, and missing env stay distinct", () => {
  const unverified = authErrorMessage({ code: "email_not_confirmed", message: "Email not confirmed" }, "sign-in")
  const credentials = authErrorMessage({ code: "invalid_credentials", message: "Invalid login credentials" }, "sign-in")
  const session = authErrorMessage({ message: "JWT expired" }, "session")
  const link = authErrorMessage({ code: "otp_expired", message: "Email link is invalid or has expired" }, "callback")
  const missing = loginBanner("unconfigured")
  assert.equal(session, "Your session has expired. Sign in again.")
  assert.equal(link, "This link has expired. Request a new one.")
  assert.equal(loginCodeForSessionFailure("expired"), "session")
  assert.equal(loginBanner("session"), session)
  assert.equal(loginBanner("expired"), link)
  assert.equal(new Set([unverified, credentials, session, link, missing]).size, 5)
})

function query(search: string) {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
}

test("unconfigured installs do not redirect dashboard routes", () => {
  for (const pathname of ["/", "/shifts", "/fuel", "/hourly", "/bills", "/vehicle", "/settings"]) {
    const decision = protectedRouteDecision({
      configured: false,
      pathname,
      search: "",
      next: null,
      userId: null,
      failure: null,
    })
    assert.equal(decision.action, "continue")
    assert.equal(decision.pathname, pathname)
  }
})

test("unsigned dashboard visits go to login with a safe next path", () => {
  for (const pathname of ["/", "/shifts", "/fuel", "/hourly", "/bills", "/vehicle", "/settings"]) {
    const decision = protectedRouteDecision({
      configured: true,
      pathname,
      search: "",
      next: null,
      userId: null,
      failure: null,
    })
    assert.equal(decision.action, "redirect")
    assert.equal(decision.pathname, "/login")
    assert.equal(query(decision.search).get("next"), pathname)
    assert.equal(query(decision.search).get("error"), null)
  }

  const withQuery = protectedRouteDecision({
    configured: true,
    pathname: "/shifts",
    search: "?week=1",
    next: null,
    userId: null,
    failure: null,
  })
  assert.equal(query(withQuery.search).get("next"), "/shifts?week=1")

  const expired = protectedRouteDecision({
    configured: true,
    pathname: "/settings",
    search: "",
    next: null,
    userId: null,
    failure: "expired",
  })
  assert.equal(query(expired.search).get("error"), "session")
  assert.equal(query(expired.search).get("next"), "/settings")
  assert.equal(loginBanner(query(expired.search).get("error") ?? ""), "Your session has expired. Sign in again.")
})

test("signed-in login and signup follow a safe next path", () => {
  const settings = protectedRouteDecision({
    configured: true,
    pathname: "/login",
    search: "?next=%2Fsettings",
    next: "/settings",
    userId: "user-1",
    failure: null,
  })
  assert.equal(settings.action, "redirect")
  assert.equal(settings.pathname, "/settings")
  assert.equal(settings.search, "")
  assert.equal(settings.hash, "")

  const hashed = protectedRouteDecision({
    configured: true,
    pathname: "/signup",
    search: "",
    next: "/vehicle#mileage",
    userId: "user-1",
    failure: null,
  })
  assert.equal(hashed.pathname, "/vehicle")
  assert.equal(hashed.hash, "#mileage")

  for (const next of ["https://evil.example/phish", "//evil.example", "/\\evil.example", null]) {
    const decision = protectedRouteDecision({
      configured: true,
      pathname: "/login",
      search: "",
      next,
      userId: "user-1",
      failure: null,
    })
    assert.equal(decision.action, "redirect")
    assert.equal(decision.pathname, "/")
    assert.equal(decision.search, "")
    assert.equal(decision.hash, "")
  }
})

test("auth pages, the callback, and account API stay reachable without a session", () => {
  for (const pathname of ["/login", "/signup", "/forgot-password", "/reset-password", "/auth/callback", "/api/account"]) {
    const decision = protectedRouteDecision({
      configured: true,
      pathname,
      search: "",
      next: "//evil.example",
      userId: null,
      failure: "network",
    })
    assert.equal(decision.action, "continue", pathname)
  }

  const home = protectedRouteDecision({
    configured: true,
    pathname: "/",
    search: "",
    next: null,
    userId: "user-1",
    failure: null,
  })
  assert.equal(home.action, "continue")
})
