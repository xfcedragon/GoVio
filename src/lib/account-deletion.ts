import { isSupabaseConfigured, readEnv, type EnvLike } from "@/lib/auth"

/** Server-only env name. Never prefix this with NEXT_PUBLIC_ or EXPO_PUBLIC_. */
export const SERVICE_ROLE_ENV = "SUPABASE_SERVICE_ROLE_KEY"

export function isAccountDeletionConfigured(env: EnvLike): boolean {
  return isSupabaseConfigured(env) && readEnv(env, SERVICE_ROLE_ENV).length > 0
}
