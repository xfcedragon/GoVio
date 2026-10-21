import {
  addDays,
  formatISODate,
  isClock,
  isISODate,
  parseISODate,
  startOfWeek,
} from "@/lib/dates"
import { roundKm, roundMoney } from "@/lib/format"
import { compareShiftsDesc, distanceFuelEstimate, shiftHours } from "@/lib/metrics"
import type { FuelFill, Settings, Shift } from "@/lib/types"

export const HOURLY_PERIODS = ["today", "week", "last7", "month", "all", "custom"] as const

export type HourlyPeriod = (typeof HOURLY_PERIODS)[number]

/** Why a distance-based fuel estimate cannot be priced. Null means the estimate exists. */
export type ConsumptionGap = "no-hours" | "no-rates" | "no-kilometres" | null

export type HourlyShiftLine = {
  id: string
  date: string
  start: string
  end: string
  area: string
  note: string
  earnings: number
  kilometres: number
  hours: number
  grossHourly: number
  /** Shift kilometres × L/100 km × pump price. Null when rates are missing or this shift has no kilometres. */
  consumedFuel: number | null
  estimatedNetHourly: number | null
}

export type HourlyDayBar = {
  date: string
  earnings: number
  hours: number
  grossHourly: number
}

export type HourlyReport = {
  period: HourlyPeriod
  /** Inclusive bounds. Null start and end means every saved shift. */
  start: string | null
  end: string | null
  lines: HourlyShiftLine[]
  excludedCount: number
  totalHours: number
  totalEarnings: number
  kilometres: number
  shiftCount: number
  /** Total gross earnings ÷ total hours. Null when there are no usable hours. */
  grossHourly: number | null
  averagePerShift: number | null
  best: HourlyShiftLine | null
  /** Period kilometres × L/100 km × pump price. Does not use fill-up receipts. */
  consumedFuel: number | null
  /** Gross earnings minus consumed fuel. Null when consumed fuel is unavailable. */
  estimatedNet: number | null
  estimatedNetHourly: number | null
  consumptionGap: ConsumptionGap
  /** Sum of fill-ups dated in the period. Null when none were recorded. */
  fillupSpend: number | null
  /**
   * Gross earnings minus fill-up receipts. Cash paid at the pump, not fuel burned.
   * Null when no fill-up is dated in the period. Never combined with consumedFuel.
   */
  cashFlowAfterFillups: number | null
  days: HourlyDayBar[]
  ranking: HourlyShiftLine[]
}

export type HourlyResult =
  | { status: "pending-clock" }
  | { status: "needs-dates" }
  | { status: "invalid-range" }
  | { status: "ready"; report: HourlyReport }

const RANKING_LIMIT = 5

export function usableShiftHours(start: string, end: string): number | null {
  if (!isClock(start) || !isClock(end)) return null
  const hours = shiftHours(start, end)
  if (!Number.isFinite(hours) || hours <= 0) return null
  return hours
}

function hasFuelRates(settings: Settings): boolean {
  return (
    settings.litresPer100km !== null &&
    settings.litresPer100km > 0 &&
    settings.fuelPricePerLitre !== null &&
    settings.fuelPricePerLitre > 0
  )
}

function inPeriod(date: string, start: string | null, end: string | null): boolean {
  if (start === null || end === null) return true
  return date >= start && date <= end
}

function resolveBounds(
  period: HourlyPeriod,
  today: Date | null,
  customStart: string,
  customEnd: string,
): HourlyResult | { status: "bounds"; start: string | null; end: string | null } {
  if (period === "all") return { status: "bounds", start: null, end: null }
  if (period === "custom") {
    const start = customStart.trim()
    const end = customEnd.trim()
    if (!start || !end) return { status: "needs-dates" }
    if (!isISODate(start) || !isISODate(end) || start > end) return { status: "invalid-range" }
    return { status: "bounds", start, end }
  }
  if (!today) return { status: "pending-clock" }
  const todayIso = formatISODate(today)
  if (period === "today") return { status: "bounds", start: todayIso, end: todayIso }
  if (period === "week") {
    const start = formatISODate(startOfWeek(today))
    return { status: "bounds", start, end: addDays(start, 6) }
  }
  if (period === "last7") {
    return { status: "bounds", start: addDays(todayIso, -6), end: todayIso }
  }
  const monthStart = `${todayIso.slice(0, 7)}-01`
  const cursor = parseISODate(todayIso)
  const monthEnd = formatISODate(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0))
  return { status: "bounds", start: monthStart, end: monthEnd }
}

function rateRank(a: { precise: number; shift: Shift }, b: { precise: number; shift: Shift }): number {
  if (a.precise !== b.precise) return b.precise - a.precise
  if (a.shift.earnings !== b.shift.earnings) return b.shift.earnings - a.shift.earnings
  return compareShiftsDesc(a.shift, b.shift)
}

/**
 * Hourly earnings for one period.
 * Gross hourly is total payout ÷ total hours of shifts with a real duration.
 * Estimated net hourly subtracts fuel consumed only.
 * Fill-up receipts are reported separately and are not treated as fuel burned.
 */
export function computeHourly(input: {
  shifts: Shift[]
  fuel: FuelFill[]
  settings: Settings
  period: HourlyPeriod
  today: Date | null
  customStart?: string
  customEnd?: string
}): HourlyResult {
  const bounds = resolveBounds(
    input.period,
    input.today,
    input.customStart ?? "",
    input.customEnd ?? "",
  )
  if (bounds.status !== "bounds") return bounds
  const { start, end } = bounds

  const eligible: { shift: Shift; hours: number; precise: number }[] = []
  let excludedCount = 0
  for (const shift of input.shifts) {
    if (!inPeriod(shift.date, start, end)) continue
    const hours = usableShiftHours(shift.start, shift.end)
    if (hours === null) {
      excludedCount += 1
      continue
    }
    eligible.push({ shift, hours, precise: shift.earnings / hours })
  }

  const totalHours = eligible.reduce((sum, item) => sum + item.hours, 0)
  const totalEarnings = roundMoney(eligible.reduce((sum, item) => sum + item.shift.earnings, 0))
  const kilometres = roundKm(eligible.reduce((sum, item) => sum + item.shift.kilometres, 0))
  const grossHourly = totalHours > 0 ? roundMoney(totalEarnings / totalHours) : null
  const averagePerShift =
    eligible.length > 0 ? roundMoney(totalEarnings / eligible.length) : null

  // Distance estimate only. A fill-up is cash at the pump and is not added here.
  const consumedFuel = totalHours > 0 ? distanceFuelEstimate(kilometres, input.settings) : null
  const consumptionGap: ConsumptionGap =
    totalHours <= 0
      ? "no-hours"
      : !hasFuelRates(input.settings)
        ? "no-rates"
        : consumedFuel === null
          ? "no-kilometres"
          : null
  const estimatedNet = consumedFuel === null ? null : roundMoney(totalEarnings - consumedFuel)
  const estimatedNetHourly =
    estimatedNet === null || totalHours <= 0 ? null : roundMoney(estimatedNet / totalHours)

  const fills = input.fuel.filter((fill) => inPeriod(fill.date, start, end))
  const fillupSpend =
    fills.length === 0 ? null : roundMoney(fills.reduce((sum, fill) => sum + fill.total, 0))
  const cashFlowAfterFillups =
    fillupSpend === null ? null : roundMoney(totalEarnings - fillupSpend)

  const ranked = [...eligible].sort(rateRank)
  const toLine = (item: { shift: Shift; hours: number }): HourlyShiftLine => {
    const consumed = distanceFuelEstimate(item.shift.kilometres, input.settings)
    return {
      id: item.shift.id,
      date: item.shift.date,
      start: item.shift.start,
      end: item.shift.end,
      area: item.shift.area,
      note: item.shift.note,
      earnings: item.shift.earnings,
      kilometres: item.shift.kilometres,
      hours: item.hours,
      grossHourly: roundMoney(item.shift.earnings / item.hours),
      consumedFuel: consumed,
      estimatedNetHourly:
        consumed === null ? null : roundMoney((item.shift.earnings - consumed) / item.hours),
    }
  }

  const lines = [...eligible]
    .sort((a, b) => compareShiftsDesc(a.shift, b.shift))
    .map(toLine)
  const ranking = ranked.slice(0, RANKING_LIMIT).map(toLine)
  const best = ranking[0] ?? null

  const dayTotals = new Map<string, { earnings: number; hours: number }>()
  for (const item of eligible) {
    const current = dayTotals.get(item.shift.date) ?? { earnings: 0, hours: 0 }
    current.earnings += item.shift.earnings
    current.hours += item.hours
    dayTotals.set(item.shift.date, current)
  }
  const days: HourlyDayBar[] = [...dayTotals.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, totals]) => ({
      date,
      earnings: roundMoney(totals.earnings),
      hours: totals.hours,
      grossHourly: roundMoney(totals.earnings / totals.hours),
    }))

  return {
    status: "ready",
    report: {
      period: input.period,
      start,
      end,
      lines,
      excludedCount,
      totalHours,
      totalEarnings,
      kilometres,
      shiftCount: eligible.length,
      grossHourly,
      averagePerShift,
      best,
      consumedFuel,
      estimatedNet,
      estimatedNetHourly,
      consumptionGap,
      fillupSpend,
      cashFlowAfterFillups,
      days,
      ranking,
    },
  }
}
