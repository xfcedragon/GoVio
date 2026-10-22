import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import {
  destinationAfterAuth,
  isDashboardPath,
  isSignedInEntryPath,
  isSupabaseConfigured,
  publicSupabaseConfig,
  safeNextPath,
  sessionFailure,
} from "@/lib/auth"

function copySession(from: NextResponse, to: NextResponse) {
  const source = from.headers as Headers & { getSetCookie?: () => string[] }
  const setCookies = source.getSetCookie?.() ?? []
  if (setCookies.length > 0) {
    for (const cookie of setCookies) to.headers.append("set-cookie", cookie)
  } else {
    from.cookies.getAll().forEach((cookie) => {
      to.cookies.set(cookie.name, cookie.value)
    })
  }
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(header)
    if (value) to.headers.set(header, value)
  }
  return to
}

function redirectWithSession(request: NextRequest, sessionResponse: NextResponse, pathname: string, search: string) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = search
  return copySession(sessionResponse, NextResponse.redirect(url))
}

export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured(process.env)) return NextResponse.next()
  const config = publicSupabaseConfig(process.env)
  if (!config) return NextResponse.next()

  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options)
        })
        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value)
        })
      },
    },
  })

  let userId: string | null = null
  let failure: ReturnType<typeof sessionFailure> = null
  try {
    const { data, error } = await supabase.auth.getClaims()
    if (error) {
      const classified = sessionFailure(error)
      const message = (error.message ?? "").toLowerCase()
      const name = (error.name ?? "").toLowerCase()
      const anonymous = name === "authsessionmissingerror" || message.includes("auth session missing")
      failure = classified ?? (anonymous ? null : "network")
    } else if (typeof data?.claims?.sub === "string" && data.claims.sub) userId = data.claims.sub
  } catch (error) {
    const record = typeof error === "object" && error !== null ? (error as { message?: string; name?: string }) : {}
    failure = sessionFailure({ message: record.message, name: record.name }) ?? "network"
  }

  const pathname = request.nextUrl.pathname
  if (pathname.startsWith("/api/") || pathname.startsWith("/auth/")) return supabaseResponse

  if (isDashboardPath(pathname) && !userId) {
    const params = new URLSearchParams()
    if (failure) params.set("error", failure)
    const nextTarget = safeNextPath(`${pathname}${request.nextUrl.search}`)
    if (nextTarget && nextTarget !== "/") params.set("next", nextTarget)
    return redirectWithSession(request, supabaseResponse, "/login", params.size ? `?${params.toString()}` : "")
  }

  if (userId && isSignedInEntryPath(pathname)) {
    const next = destinationAfterAuth(request.nextUrl.searchParams.get("next"))
    const destination = new URL(next, request.url)
    return redirectWithSession(request, supabaseResponse, destination.pathname, destination.search)
  }

  return supabaseResponse
}
