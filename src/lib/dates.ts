export function formatISODate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso)
  date.setDate(date.getDate() + days)
  return formatISODate(date)
}

export function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const weekday = start.getDay()
  const mondayOffset = weekday === 0 ? 6 : weekday - 1
  start.setDate(start.getDate() - mondayOffset)
  return start
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = parseISODate(fromIso)
  const to = parseISODate(toIso)
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return formatISODate(parseISODate(value)) === value
}

export function isClock(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false
  const [hour, minute] = value.split(":").map(Number)
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
}

export function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

export function formatWeekdayDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(parseISODate(iso))
}

export function formatMonthDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
  }).format(parseISODate(iso))
}

export function formatTime(value: string): string {
  const [hourStr, minute] = value.split(":")
  const hour = Number(hourStr)
  const suffix = hour >= 12 ? "p.m." : "a.m."
  const hour12 = hour % 12 || 12
  return `${hour12}:${minute} ${suffix}`
}

export function greetingFor(date: Date, name: string): string {
  const hour = date.getHours()
  const hello =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const trimmed = name.trim()
  return trimmed ? `${hello}, ${trimmed}` : hello
}

export function greetingWithoutClock(name: string): string {
  const trimmed = name.trim()
  return trimmed ? `Hello, ${trimmed}` : "Hello"
}

export function duePhrase(due: string, today: string): string {
  const diff = daysBetween(today, due)
  if (diff === 0) return "Due today"
  if (diff === 1) return "Due tomorrow"
  if (diff > 1 && diff < 14) return `Due in ${diff} days`
  if (diff === -1) return "Due yesterday"
  if (diff < 0) return `Overdue by ${Math.abs(diff)} days`
  return `Due ${formatMonthDay(due)}`
}
