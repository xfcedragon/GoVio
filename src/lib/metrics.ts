import { addDays, formatISODate, startOfWeek } from "@/lib/dates"
import { roundKm, roundMoney } from "@/lib/format"
import type {
  DashboardMetrics,
  FuelFill,
  FuelMethod,
  PeriodSnapshot,
  Settings,
  Shift,
  Snapshot,
} from "@/lib/types"

export function shiftHours(start: string, end: string): number {
  const [startHour, startMinute] = start.split(":").map(Number)
  const [endHour, endMinute] = end.split(":").map(Number)
  const startTotal = startHour * 60 + startMinute
  let endTotal = endHour * 60 + endMinute
  if (endTotal < startTotal) endTotal += 24 * 60
  return (endTotal - startTotal) / 60
}

export function compareShiftsDesc(a: Shift, b: Shift): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  if (a.start !== b.start) return a.start < b.start ? 1 : -1
  return a.id < b.id ? 1 : -1
}

export function summarizeShifts(shifts: Shift[]) {
  return {
    count: shifts.length,
    earnings: roundMoney(shifts.reduce((sum, shift) => sum + shift.earnings, 0)),
    hours: shifts.reduce((sum, shift) => sum + shiftHours(shift.start, shift.end), 0),
    kilometres: roundKm(shifts.reduce((sum, shift) => sum + shift.kilometres, 0)),
  }
}

export function distanceFuelEstimate(
  kilometres: number,
  settings: Settings,
): number | null {
  if (
    settings.litresPer100km === null ||
    settings.litresPer100km <= 0 ||
    settings.fuelPricePerLitre === null ||
    settings.fuelPricePerLitre <= 0 ||
    kilometres <= 0
  ) {
    return null
  }
  return roundMoney(
    kilometres * (settings.litresPer100km / 100) * settings.fuelPricePerLitre,
  )
}

function periodFuel(
  fuel: FuelFill[],
  kilometres: number,
  settings: Settings,
  start: string,
  end: string,
): { cost: number; method: FuelMethod } {
  const fills = fuel.filter((fill) => fill.date >= start && fill.date <= end)
  if (fills.length > 0) {
    return {
      cost: roundMoney(fills.reduce((sum, fill) => sum + fill.total, 0)),
      method: "fillups",
    }
  }
  const estimate = distanceFuelEstimate(kilometres, settings)
  if (estimate !== null) return { cost: estimate, method: "estimate" }
  return { cost: 0, method: "none" }
}

function computePeriod(
  shifts: Shift[],
  fuel: FuelFill[],
  settings: Settings,
  start: string,
  end: string,
): PeriodSnapshot {
  const inPeriod = shifts.filter((shift) => shift.date >= start && shift.date <= end)
  const summary = summarizeShifts(inPeriod)
  const fuelResult = periodFuel(fuel, summary.kilometres, settings, start, end)
  return {
    earnings: summary.earnings,
    kilometres: summary.kilometres,
    hours: summary.hours,
    shiftCount: summary.count,
    fuelCost: fuelResult.cost,
    fuelMethod: fuelResult.method,
    net:
      fuelResult.method === "none"
        ? null
        : roundMoney(summary.earnings - fuelResult.cost),
  }
}

export function computeMetrics(snapshot: Snapshot, now: Date): DashboardMetrics {
  const todayIso = formatISODate(now)
  const weekStart = startOfWeek(now)
  const weekStartIso = formatISODate(weekStart)
  const weekEndIso = addDays(weekStartIso, 6)
  const week = computePeriod(
    snapshot.shifts,
    snapshot.fuel,
    snapshot.settings,
    weekStartIso,
    weekEndIso,
  )
  const allTime = summarizeShifts(snapshot.shifts)
  const target = snapshot.settings.weeklyIncomeTarget
  return {
    todayIso,
    weekStartIso,
    weekEndIso,
    today: computePeriod(
      snapshot.shifts,
      snapshot.fuel,
      snapshot.settings,
      todayIso,
      todayIso,
    ),
    week,
    allTime: {
      earnings: allTime.earnings,
      kilometres: allTime.kilometres,
      hours: allTime.hours,
      shiftCount: allTime.count,
    },
    hasShifts: snapshot.shifts.length > 0,
    target,
    weekProgress: target > 0 ? week.earnings / target : null,
  }
}

export function fuelMethodLabel(method: FuelMethod): string {
  switch (method) {
    case "fillups":
      return "Logged fill-ups"
    case "estimate":
      return "km × L/100 km × pump price"
    case "none":
      return "No fuel figure yet"
  }
}
