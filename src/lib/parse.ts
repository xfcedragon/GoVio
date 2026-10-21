export function parseDecimal(raw: string, scale: number): number | null {
  const cleaned = raw.trim().replace(/[$,\s]/g, "")
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  const factor = 10 ** scale
  return Math.round(value * factor) / factor
}

export function parseOptionalInteger(raw: string): number | null | undefined {
  const cleaned = raw.trim()
  if (!cleaned) return null
  if (!/^\d+$/.test(cleaned)) return undefined
  return Number(cleaned)
}
