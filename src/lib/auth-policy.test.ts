import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
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

test("signup trigger is security definer with a locked search path and does not seed ledger rows", () => {
  assert.match(sql, /security definer/i)
  assert.match(sql, /set search_path = ''/i)
  assert.match(sql, /default 'SkipTheDishes'/)
  assert.doesNotMatch(sql, /insert into public\.(shifts|vehicles|fuel_purchases|mileage_entries|expenses|receipts)\b/i)
})
