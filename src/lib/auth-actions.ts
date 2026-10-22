"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import {
  asAuthFailure,
  authErrorMessage,
  destinationAfterAuth,
  isExpiredAuthFailure,
  isSupabaseConfigured,
  sessionFailure,
  validateForgotPassword,
  validateFullName,
  validatePasswordReset,
  validateSignIn,
  validateSignUp,
  type AuthActionState,
  type FieldErrors,
  type ProfileActionState,
} from "@/lib/auth"
import { createSupabaseServerClient } from "@/lib/supabase/server"

function invalid(fieldErrors: FieldErrors): AuthActionState {
  return { status: "error", message: "Fix the highlighted fields.", fieldErrors }
}

function failed(message: string): AuthActionState {
  return { status: "error", message, fieldErrors: {} }
}

async function requestOrigin(): Promise<string> {
  const headerList = await headers()
  const host = headerList.get("host")
  if (!host || /[\s/\\@,]/.test(host)) return "http://127.0.0.1:43127"
  const local = host.startsWith("127.0.0.1") || host.startsWith("localhost")
  const proto = !local && headerList.get("x-forwarded-proto") === "https" ? "https" : "http"
  return `${proto}://${host}`
}

function callbackUrl(origin: string, nextPath: string): string {
  const callback = new URL("/auth/callback", origin)
  if (nextPath !== "/") callback.searchParams.set("next", nextPath)
  return callback.toString()
}

async function clientOrConfigError() {
  if (!isSupabaseConfigured(process.env)) return { supabase: null, error: failed("Account sign-in is not configured.") }
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { supabase: null, error: failed("Account sign-in is not configured.") }
  return { supabase, error: null }
}

export async function signUpAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const input = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
  }
  const fieldErrors = validateSignUp(input)
  if (fieldErrors) return invalid(fieldErrors)
  const { supabase, error: configError } = await clientOrConfigError()
  if (!supabase) return configError ?? failed("Account sign-in is not configured.")

  const origin = await requestOrigin()
  const next = destinationAfterAuth(formData.get("next"))
  let data: Awaited<ReturnType<typeof supabase.auth.signUp>>["data"]
  try {
    const result = await supabase.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: {
        emailRedirectTo: callbackUrl(origin, next),
        data: { full_name: input.fullName.trim() },
      },
    })
    if (result.error) return failed(authErrorMessage(result.error, "sign-up"))
    data = result.data
  } catch (error) {
    return failed(authErrorMessage(asAuthFailure(error), "sign-up"))
  }

  const confirmed = Boolean(data.user?.email_confirmed_at)
  if (!data.session || !confirmed) {
    if (data.session) {
      try {
        await supabase.auth.signOut()
      } catch {
        // The confirmation message still stands. A leftover cookie is not a verified session.
      }
    }
    return {
      status: "check-email",
      message: `Check ${input.email.trim()} for a confirmation link. GoVio does not mark the account verified until you open that link.`,
      fieldErrors: {},
    }
  }

  redirect(next)
}

export async function signInAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const input = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  }
  const fieldErrors = validateSignIn(input)
  if (fieldErrors) return invalid(fieldErrors)
  const { supabase, error: configError } = await clientOrConfigError()
  if (!supabase) return configError ?? failed("Account sign-in is not configured.")

  let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["data"]
  try {
    const result = await supabase.auth.signInWithPassword({
      email: input.email.trim(),
      password: input.password,
    })
    if (result.error) return failed(authErrorMessage(result.error, "sign-in"))
    data = result.data
  } catch (error) {
    return failed(authErrorMessage(asAuthFailure(error), "sign-in"))
  }
  if (!data.session || !data.user?.email_confirmed_at) {
    if (data.session) {
      try {
        await supabase.auth.signOut()
      } catch {
        // Still refuse the unverified session.
      }
    }
    return failed("This email is not verified yet. Open the confirmation link, then sign in.")
  }
  redirect(destinationAfterAuth(formData.get("next")))
}

export async function forgotPasswordAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "")
  const fieldErrors = validateForgotPassword(email)
  if (fieldErrors) return invalid(fieldErrors)
  const { supabase, error: configError } = await clientOrConfigError()
  if (!supabase) return configError ?? failed("Account sign-in is not configured.")

  const origin = await requestOrigin()
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: callbackUrl(origin, "/reset-password"),
    })
    if (error) return failed(authErrorMessage(error, "reset"))
  } catch (error) {
    return failed(authErrorMessage(asAuthFailure(error), "reset"))
  }
  return {
    status: "check-email",
    message: "If that email can receive mail, a reset link is on its way. Open it in this browser. If nothing arrives, the address may not have an account.",
    fieldErrors: {},
  }
}

export async function resetPasswordAction(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  const input = {
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  }
  const fieldErrors = validatePasswordReset(input)
  if (fieldErrors) return invalid(fieldErrors)
  const { supabase, error: configError } = await clientOrConfigError()
  if (!supabase) return configError ?? failed("Account sign-in is not configured.")

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      const expired = userError && (isExpiredAuthFailure(userError) || sessionFailure(userError) === "expired")
      return failed(
        expired || !userError
          ? "This reset link is invalid or has expired. Request a new one."
          : authErrorMessage(userError, "session"),
      )
    }
    const { error } = await supabase.auth.updateUser({ password: input.password })
    if (error) {
      if (isExpiredAuthFailure(error) || sessionFailure(error) === "expired") {
        return failed("This reset link is invalid or has expired. Request a new one.")
      }
      return failed(authErrorMessage(error, "reset"))
    }
  } catch (error) {
    const failure = asAuthFailure(error)
    if (isExpiredAuthFailure(failure) || sessionFailure(failure) === "expired") {
      return failed("This reset link is invalid or has expired. Request a new one.")
    }
    return failed(authErrorMessage(failure, "reset"))
  }
  redirect("/settings")
}

export async function updateProfileNameAction(
  _state: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  if (!isSupabaseConfigured(process.env)) return { status: "error", message: "Account sign-in is not configured." }
  const fullName = String(formData.get("fullName") ?? "")
  const nameError = validateFullName(fullName)
  if (nameError) return { status: "error", message: nameError }
  try {
    const supabase = await createSupabaseServerClient()
    if (!supabase) return { status: "error", message: "Account sign-in is not configured." }

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData.user) {
      return {
        status: "error",
        message: userError ? authErrorMessage(userError, "session") : "Your session has expired. Sign in again.",
      }
    }

    const { data, error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() })
      .eq("id", userData.user.id)
      .select("full_name")
      .maybeSingle()
    if (error) {
      return { status: "error", message: "The profile could not be saved. Apply the database migrations, then try again." }
    }
    if (!data) {
      return {
        status: "error",
        message: "No profile row exists for this account yet. Apply the signup trigger migration, then try again.",
      }
    }
    return { status: "saved", message: "Account name saved." }
  } catch (error) {
    const failure = asAuthFailure(error)
    const kind = sessionFailure(failure)
    if (kind === "network" || kind === "config" || kind === "expired") {
      return { status: "error", message: authErrorMessage(failure, "session") }
    }
    return {
      status: "error",
      message: "The profile could not be saved. Apply the database migrations, then try again.",
    }
  }
}

export async function logoutAction(state: { message: string } | null): Promise<{ message: string } | null> {
  void state
  if (!isSupabaseConfigured(process.env)) redirect("/login?error=unconfigured")
  const supabase = await createSupabaseServerClient()
  if (!supabase) redirect("/login?error=unconfigured")
  try {
    const { error } = await supabase.auth.signOut()
    if (error) return { message: authErrorMessage(error, "session") }
  } catch (error) {
    return { message: authErrorMessage(asAuthFailure(error), "session") }
  }
  redirect("/login")
}
