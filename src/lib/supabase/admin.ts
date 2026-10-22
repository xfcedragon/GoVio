import "server-only"

import { createClient } from "@supabase/supabase-js"
import { isAccountDeletionConfigured, SERVICE_ROLE_ENV } from "@/lib/account-deletion"
import { publicSupabaseConfig, readEnv } from "@/lib/auth"

export function createSupabaseAdminClient() {
  const config = publicSupabaseConfig(process.env)
  const serviceRoleKey = readEnv(process.env, SERVICE_ROLE_ENV)
  if (!config || !serviceRoleKey || !isAccountDeletionConfigured(process.env)) return null
  return createClient(config.url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
