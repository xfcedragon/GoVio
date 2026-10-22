import { type NextRequest, NextResponse } from "next/server"
import { destinationAfterAuth, isSupabaseConfigured } from "@/lib/auth"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const OTP_TYPES = new Set(["signup", "invite", "magiclink", "recovery", "email_change", "email"])

function loginError(origin: string, code: "callback" | "expired" | "network" | "config" | "unconfigured") {
  return NextResponse.redirect(new URL(`/login?error=${code}`, origin))
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

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, url.origin))
    const message = (error.message ?? "").toLowerCase()
    if (message.includes("expired")) return loginError(url.origin, "expired")
    if (message.includes("fetch") || message.includes("network")) return loginError(url.origin, "network")
    return loginError(url.origin, "callback")
  }

  if (tokenHash && type && OTP_TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email",
      token_hash: tokenHash,
    })
    if (!error) {
      const destination = type === "recovery" ? destinationAfterAuth(requested || "/reset-password") : next
      return NextResponse.redirect(new URL(destination, url.origin))
    }
    const message = (error.message ?? "").toLowerCase()
    if (message.includes("expired")) return loginError(url.origin, "expired")
    if (message.includes("fetch") || message.includes("network")) return loginError(url.origin, "network")
    return loginError(url.origin, "callback")
  }

  if (url.searchParams.get("error") || url.searchParams.get("error_description")) {
    return loginError(url.origin, "callback")
  }

  return loginError(url.origin, "callback")
}
