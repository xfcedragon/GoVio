import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { isExpoSupabaseConfigured, publicExpoConfig } from "../../src/lib/auth"
import { secureStoreAdapter } from "./secure-store"

export function createExpoSupabase(): SupabaseClient | null {
  if (!isExpoSupabaseConfigured(process.env)) return null
  const config = publicExpoConfig(process.env)
  if (!config) return null
  return createClient(config.url, config.anonKey, {
    auth: {
      storage: secureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  })
}

export const supabase = createExpoSupabase()
