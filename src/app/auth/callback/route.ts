import { type NextRequest, NextResponse } from "next/server"
import {
  asAuthFailure,
  authLinkErrorCode,
  destinationAfterAuth,
  isExpiredAuthFailure,
  isSupabaseConfigured,
  sessionFailure,
  type AuthFailure,
} from "@/lib/auth"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const OTP_TYPES = new Set(["signup", "invite", "magiclink", "recovery", "email_change", "email"])

function privateRedirect(url: URL) {
  const response = NextResponse.redirect(url)
  response.headers.set("cache-control", "private, no-cache, no-store, must-revalidate, max-age=0")
  return response
}

function loginError(origin: string, code: "callback" | "expired" | "network" | "config" | "unconfigured") {
  return privateRedirect(new URL(`/login?error=${code}`, origin))
}

function callbackFailure(error: unknown): "expired" | "network" | "config" | "callback" {
  const failure = asAuthFailure(error)
  if (isExpiredAuthFailure(failure)) return "expired"
  const kind = sessionFailure(failure)
  if (kind === "network") return "network"
  if (kind === "config") return "config"
  return "callback"
}

async function finishExchange(
  result: Promise<{ error: AuthFailure | null }>,
): Promise<"ok" | "expired" | "network" | "config" | "callback"> {
  try {
    const { error } = await result
    if (!error) return "ok"
    return callbackFailure(error)
  } catch (error) {
    return callbackFailure(error)
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  if (!isSupabaseConfigured(process.env)) return loginError(url.origin, "unconfigured")
  const supabase = await createSupabaseServerClient()
  if (!supabase) return loginError(url.origin, "unconfigured")

  const code = url.searchParams.get("code")
  const tokenHash = url.searchParams.get("token_hash")
  const type = url.searchParams.get("type")
  const requested = url.searchParams.get("next")
  const fallback = type === "recovery" ? "/reset-password" : "/"
  const next = destinationAfterAuth(requested && requested.length > 0 ? requested : fallback)
  const linkError = authLinkErrorCode({
    error: url.searchParams.get("error"),
    errorCode: url.searchParams.get("error_code"),
    description: url.searchParams.get("error_description"),
  })
  if (linkError) return loginError(url.origin, linkError)

  if (code) {
    const outcome = await finishExchange(supabase.auth.exchangeCodeForSession(code))
    if (outcome === "ok") return privateRedirect(new URL(next, url.origin))
    return loginError(url.origin, outcome)
  }

  if (tokenHash && type && OTP_TYPES.has(type)) {
    const outcome = await finishExchange(
      supabase.auth.verifyOtp({
        type: type as "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email",
        token_hash: tokenHash,
      }),
    )
    if (outcome === "ok") {
      const destination = type === "recovery" ? destinationAfterAuth(requested || "/reset-password") : next
      return privateRedirect(new URL(destination, url.origin))
    }
    return loginError(url.origin, outcome)
  }

  return loginError(url.origin, "callback")
}
