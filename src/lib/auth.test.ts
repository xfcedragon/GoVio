import assert from "node:assert/strict"
import { test } from "node:test"
import { isAccountDeletionConfigured, SERVICE_ROLE_ENV } from "@/lib/account-deletion"
import {
  authErrorMessage,
  destinationAfterAuth,
  isExpoSupabaseConfigured,
  isSupabaseConfigured,
  safeNextPath,
  sessionFailure,
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
