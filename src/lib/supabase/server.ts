import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { publicSupabaseConfig } from "@/lib/auth"

export async function createSupabaseServerClient() {
  const config = publicSupabaseConfig(process.env)
  if (!config) return null
  const cookieStore = await cookies()
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet, headers) {
        void headers
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Server Components cannot set cookies. The proxy refreshes the session.
        }
      },
    },
  })
}
