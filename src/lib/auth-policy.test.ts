import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261022160000_auth_foundation.sql"), "utf8")

const TABLES = [
  "profiles",
  "vehicles",
  "receipts",
  "shifts",
  "fuel_purchases",
  "mileage_entries",
  "expenses",
] as const

test("every account table enables and forces row level security", () => {
  for (const table of TABLES) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`, "i"))
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security;`, "i"))
  }
})

test("owned rows cascade from auth.users and policies compare auth.uid()", () => {
  const cascades = sql.match(/references auth\.users \(id\) on delete cascade/gi) ?? []
  assert.equal(cascades.length, TABLES.length)
  assert.match(sql, /auth\.uid\(\) = id/)
  assert.match(sql, /auth\.uid\(\) = user_id/)
  assert.doesNotMatch(sql, /using\s*\(\s*user_id\s*=\s*current_setting/i)
  assert.match(sql, /auth\.uid\(\)::text \|\| '\/%'/)
})

test("the receipts bucket is private and anon is not granted table access", () => {
  assert.match(sql, /'receipts',\s*'receipts',\s*false/)
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete|all)[^;]*\bto\s+anon\b/i)
  assert.match(sql, /revoke all on table public\.profiles from anon, public/i)
})

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue
      found.push(...sourceFiles(path))
      continue
    }
    if (path.endsWith(".ts") || path.endsWith(".tsx")) found.push(path)
  }
  return found
}

test("client components do not import the service-role client or its env name", () => {
  const roots = [join(process.cwd(), "src"), join(process.cwd(), "mobile")].filter((dir) => statSync(dir).isDirectory())
  for (const file of roots.flatMap(sourceFiles)) {
    const text = readFileSync(file, "utf8")
    if (!text.includes('"use client"') && !file.includes(`${join("mobile", "App.tsx")}`) && !file.includes("/mobile/")) {
      continue
    }
    if (file.endsWith(".test.ts")) continue
    assert.equal(text.includes("SUPABASE_SERVICE_ROLE_KEY"), false, file)
    assert.equal(text.includes("supabase/admin"), false, file)
    assert.equal(text.includes("createSupabaseAdminClient"), false, file)
  }
})

test("signup trigger is security definer with a locked search path and does not seed ledger rows", () => {
  assert.match(sql, /security definer/i)
  assert.match(sql, /set search_path = ''/i)
  assert.match(sql, /default 'SkipTheDishes'/)
  assert.doesNotMatch(sql, /insert into public\.(shifts|vehicles|fuel_purchases|mileage_entries|expenses|receipts)\b/i)
})
