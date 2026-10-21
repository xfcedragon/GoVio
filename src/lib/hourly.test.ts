import assert from "node:assert/strict"
import { test } from "node:test"
import { parseISODate } from "@/lib/dates"
import { roundMoney } from "@/lib/format"
import { computeHourly, type HourlyReport, type HourlyResult } from "@/lib/hourly"
import { EMPTY_SETTINGS, type FuelFill, type Settings, type Shift } from "@/lib/types"

const TODAY = parseISODate("2026-10-21")

function shift(partial: Partial<Shift> & Pick<Shift, "date" | "start" | "end" | "earnings">): Shift {
  return {
    id: partial.id ?? `${partial.date}-${partial.start}-${partial.end}`,
    date: partial.date,
    start: partial.start,
    end: partial.end,
    earnings: partial.earnings,
    kilometres: partial.kilometres ?? 0,
    orders: partial.orders ?? null,
    area: partial.area ?? "",
    note: partial.note ?? "",
  }
}

function fill(partial: Partial<FuelFill> & Pick<FuelFill, "date" | "total">): FuelFill {
  return {
    id: partial.id ?? `fill-${partial.date}-${partial.total}`,
    date: partial.date,
    litres: partial.litres ?? 10,
    pricePerLitre: partial.pricePerLitre ?? 1.5,
    total: partial.total,
    station: "",
    odometer: null,
  }
}

function rates(litresPer100km: number | null, fuelPricePerLitre: number | null): Settings {
  return { ...EMPTY_SETTINGS, litresPer100km, fuelPricePerLitre }
}

function ready(result: HourlyResult): HourlyReport {
  if (result.status !== "ready") assert.fail(`expected a ready report, received ${result.status}`)
  return result.report
}

test("$70 from 16:00 to 19:00 is 3 hours at $23.33 gross per hour", () => {
  const report = ready(
    computeHourly({
      shifts: [shift({ date: "2026-10-21", start: "16:00", end: "19:00", earnings: 70 })],
      fuel: [],
      settings: EMPTY_SETTINGS,
      period: "today",
      today: TODAY,
    }),
  )
  assert.equal(report.totalHours, 3)
  assert.equal(report.totalEarnings, 70)
  assert.equal(report.grossHourly, 23.33)
  assert.equal(report.shiftCount, 1)
  assert.equal(report.averagePerShift, 70)
  assert.equal(report.best?.grossHourly, 23.33)
})

test("period rate is total earnings divided by total hours", () => {
  const report = ready(
    computeHourly({
      shifts: [
        shift({ date: "2026-10-21", start: "16:00", end: "19:00", earnings: 70 }),
        shift({ date: "2026-10-21", start: "12:00", end: "13:00", earnings: 20 }),
      ],
      fuel: [],
      settings: EMPTY_SETTINGS,
      period: "today",
      today: TODAY,
    }),
  )
  const unweighted = roundMoney((roundMoney(70 / 3) + 20) / 2)
  assert.equal(unweighted, 21.67)
  assert.equal(report.totalEarnings, 90)
  assert.equal(report.totalHours, 4)
  assert.equal(report.grossHourly, 22.5)
  assert.notEqual(report.grossHourly, unweighted)
  assert.equal(report.best?.earnings, 70)
  assert.equal(report.best?.grossHourly, 23.33)
  assert.equal(report.ranking.map((line) => line.earnings).join(","), "70,20")
  assert.equal(report.days.length, 1)
  assert.equal(report.days[0]?.grossHourly, 22.5)
  assert.equal(report.averagePerShift, 45)
})

test("a 20-minute shift keeps its real duration", () => {
  const report = ready(
    computeHourly({
      shifts: [shift({ date: "2026-10-21", start: "16:00", end: "16:20", earnings: 10 })],
      fuel: [],
      settings: EMPTY_SETTINGS,
      period: "today",
      today: TODAY,
    }),
  )
  assert.equal(report.totalHours, 20 / 60)
  assert.equal(report.grossHourly, 30)
})

test("missing clocks and zero-length shifts are left out of the rate", () => {
  const report = ready(
    computeHourly({
      shifts: [
        shift({ date: "2026-10-21", start: "16:00", end: "19:00", earnings: 70 }),
        shift({ date: "2026-10-21", start: "", end: "19:00", earnings: 500 }),
        shift({ date: "2026-10-21", start: "25:00", end: "26:00", earnings: 500 }),
        shift({ date: "2026-10-21", start: "09:00", end: "09:00", earnings: 500 }),
        shift({ id: "unpaid", date: "2026-10-21", start: "08:00", end: "09:00", earnings: 0 }),
      ],
      fuel: [],
      settings: EMPTY_SETTINGS,
      period: "today",
      today: TODAY,
    }),
  )
  assert.equal(report.excludedCount, 3)
  assert.equal(report.shiftCount, 2)
  assert.equal(report.totalEarnings, 70)
  assert.equal(report.totalHours, 4)
  assert.equal(report.grossHourly, 17.5)
  assert.equal(report.lines.some((line) => line.id === "unpaid"), true)
})

test("an overnight shift from 22:00 to 01:00 counts as 3 hours", () => {
  const report = ready(
    computeHourly({
      shifts: [shift({ date: "2026-10-21", start: "22:00", end: "01:00", earnings: 90, kilometres: 40 })],
      fuel: [],
      settings: EMPTY_SETTINGS,
      period: "today",
      today: TODAY,
    }),
  )
  assert.equal(report.totalHours, 3)
  assert.equal(report.grossHourly, 30)
  assert.equal(report.lines[0]?.end, "01:00")
})

test("an empty range has null rates and does not divide by zero", () => {
  const report = ready(
    computeHourly({
      shifts: [shift({ date: "2026-10-01", start: "16:00", end: "19:00", earnings: 70 })],
      fuel: [],
      settings: rates(10, 2),
      period: "today",
      today: TODAY,
    }),
  )
  assert.equal(report.shiftCount, 0)
  assert.equal(report.totalHours, 0)
  assert.equal(report.totalEarnings, 0)
  assert.equal(report.grossHourly, null)
  assert.equal(report.estimatedNetHourly, null)
  assert.equal(report.estimatedNet, null)
  assert.equal(report.averagePerShift, null)
  assert.equal(report.best, null)
  assert.equal(report.consumptionGap, "no-hours")
  assert.equal(report.cashFlowAfterFillups, null)
  assert.equal(Number.isFinite(report.grossHourly), false)
})

test("a period with only a zero-length shift explains the missing hours", () => {
  const report = ready(
    computeHourly({
      shifts: [shift({ date: "2026-10-21", start: "16:00", end: "16:00", earnings: 70 })],
      fuel: [],
      settings: EMPTY_SETTINGS,
      period: "today",
      today: TODAY,
    }),
  )
  assert.equal(report.excludedCount, 1)
  assert.equal(report.grossHourly, null)
  assert.equal(report.consumptionGap, "no-hours")
})

test("consumed fuel and fill-up cash flow stay separate", () => {
  const shifts = [
    shift({
      date: "2026-10-21",
      start: "10:00",
      end: "12:00",
      earnings: 100,
      kilometres: 100,
    }),
  ]
  const settings = rates(10, 2)
  const withFill = ready(
    computeHourly({
      shifts,
      fuel: [fill({ date: "2026-10-21", total: 60, litres: 30, pricePerLitre: 2 })],
      settings,
      period: "today",
      today: TODAY,
    }),
  )
  // 100 km × 10 L/100 km × $2 = $20 consumed. The $60 receipt is not burned fuel.
  assert.equal(withFill.consumedFuel, 20)
  assert.equal(withFill.estimatedNet, 80)
  assert.equal(withFill.estimatedNetHourly, 40)
  assert.equal(withFill.fillupSpend, 60)
  assert.equal(withFill.cashFlowAfterFillups, 40)
  assert.notEqual(withFill.estimatedNet, roundMoney(100 - 20 - 60))
  assert.notEqual(withFill.estimatedNetHourly, roundMoney((100 - 60) / 2))
  assert.equal(withFill.lines[0]?.consumedFuel, 20)
  assert.equal(withFill.lines[0]?.estimatedNetHourly, 40)

  const ratesMissing = ready(
    computeHourly({
      shifts,
      fuel: [fill({ date: "2026-10-21", total: 60 })],
      settings: EMPTY_SETTINGS,
      period: "today",
      today: TODAY,
    }),
  )
  assert.equal(ratesMissing.grossHourly, 50)
  assert.equal(ratesMissing.consumedFuel, null)
  assert.equal(ratesMissing.estimatedNetHourly, null)
  assert.equal(ratesMissing.consumptionGap, "no-rates")
  assert.equal(ratesMissing.fillupSpend, 60)
  assert.equal(ratesMissing.cashFlowAfterFillups, 40)
  assert.equal(ratesMissing.lines[0]?.estimatedNetHourly, null)

  const noDistance = ready(
    computeHourly({
      shifts: [shift({ date: "2026-10-21", start: "10:00", end: "12:00", earnings: 100, kilometres: 0 })],
      fuel: [fill({ date: "2026-10-21", total: 60 })],
      settings,
      period: "today",
      today: TODAY,
    }),
  )
  assert.equal(noDistance.grossHourly, 50)
  assert.equal(noDistance.consumedFuel, null)
  assert.equal(noDistance.estimatedNetHourly, null)
  assert.equal(noDistance.consumptionGap, "no-kilometres")
  assert.equal(noDistance.lines[0]?.estimatedNetHourly, null)
  assert.equal(noDistance.cashFlowAfterFillups, 40)
})

test("a shift with no kilometres does not receive another shift's fuel or a fake $0", () => {
  const report = ready(
    computeHourly({
      shifts: [
        shift({
          id: "drove",
          date: "2026-10-21",
          start: "10:00",
          end: "12:00",
          earnings: 80,
          kilometres: 40,
        }),
        shift({
          id: "idle",
          date: "2026-10-21",
          start: "13:00",
          end: "14:00",
          earnings: 20,
          kilometres: 0,
        }),
      ],
      fuel: [fill({ date: "2026-10-21", total: 55 })],
      settings: rates(10, 2),
      period: "today",
      today: TODAY,
    }),
  )
  const drove = report.lines.find((line) => line.id === "drove")
  const idle = report.lines.find((line) => line.id === "idle")
  assert.equal(drove?.consumedFuel, 8)
  assert.equal(drove?.estimatedNetHourly, 36)
  assert.equal(idle?.consumedFuel, null)
  assert.equal(idle?.estimatedNetHourly, null)
  assert.equal(report.consumedFuel, 8)
  assert.equal(report.estimatedNet, 92)
  assert.equal(report.estimatedNetHourly, roundMoney(92 / 3))
  assert.equal(report.fillupSpend, 55)
  assert.equal(report.cashFlowAfterFillups, 45)
  assert.notEqual(report.estimatedNet, roundMoney(100 - 8 - 55))
})

test("fill-ups outside the period do not change cash flow", () => {
  const report = ready(
    computeHourly({
      shifts: [shift({ date: "2026-10-21", start: "16:00", end: "19:00", earnings: 70, kilometres: 30 })],
      fuel: [
        fill({ date: "2026-10-20", total: 40 }),
        fill({ date: "2026-10-21", total: 15 }),
      ],
      settings: rates(10, 2),
      period: "today",
      today: TODAY,
    }),
  )
  assert.equal(report.fillupSpend, 15)
  assert.equal(report.cashFlowAfterFillups, 55)
  assert.equal(report.consumedFuel, 6)
  assert.equal(report.estimatedNet, 64)
})

test("date bounds include the edges and leave the neighbouring day out", () => {
  const shifts = [
    shift({ id: "sun-before", date: "2026-10-18", start: "10:00", end: "11:00", earnings: 10 }),
    shift({ id: "monday", date: "2026-10-19", start: "10:00", end: "11:00", earnings: 11 }),
    shift({ id: "today", date: "2026-10-21", start: "10:00", end: "11:00", earnings: 12 }),
    shift({ id: "sunday", date: "2026-10-25", start: "10:00", end: "11:00", earnings: 13 }),
    shift({ id: "next", date: "2026-10-26", start: "10:00", end: "11:00", earnings: 14 }),
    shift({ id: "last7-edge", date: "2026-10-15", start: "10:00", end: "11:00", earnings: 15 }),
    shift({ id: "before-last7", date: "2026-10-14", start: "10:00", end: "11:00", earnings: 16 }),
    shift({ id: "month-end", date: "2026-10-31", start: "10:00", end: "11:00", earnings: 17 }),
    shift({ id: "sept", date: "2026-09-30", start: "10:00", end: "11:00", earnings: 18 }),
  ]
  const base = { shifts, fuel: [], settings: EMPTY_SETTINGS, today: TODAY }

  const week = ready(computeHourly({ ...base, period: "week" }))
  assert.equal(week.start, "2026-10-19")
  assert.equal(week.end, "2026-10-25")
  assert.deepEqual(
    week.lines.map((line) => line.id).sort(),
    ["monday", "sunday", "today"],
  )

  const last7 = ready(computeHourly({ ...base, period: "last7" }))
  assert.equal(last7.start, "2026-10-15")
  assert.equal(last7.end, "2026-10-21")
  assert.equal(last7.lines.some((line) => line.id === "last7-edge"), true)
  assert.equal(last7.lines.some((line) => line.id === "before-last7"), false)
  assert.equal(last7.lines.some((line) => line.id === "sunday"), false)

  const month = ready(computeHourly({ ...base, period: "month" }))
  assert.equal(month.start, "2026-10-01")
  assert.equal(month.end, "2026-10-31")
  assert.equal(month.lines.some((line) => line.id === "month-end"), true)
  assert.equal(month.lines.some((line) => line.id === "sept"), false)

  const today = ready(computeHourly({ ...base, period: "today" }))
  assert.deepEqual(
    today.lines.map((line) => line.id),
    ["today"],
  )

  const all = ready(computeHourly({ ...base, period: "all", today: null }))
  assert.equal(all.start, null)
  assert.equal(all.end, null)
  assert.equal(all.shiftCount, shifts.length)

  const february = ready(
    computeHourly({
      shifts: [],
      fuel: [],
      settings: EMPTY_SETTINGS,
      period: "month",
      today: parseISODate("2026-02-10"),
    }),
  )
  assert.equal(february.end, "2026-02-28")
  const leap = ready(
    computeHourly({
      shifts: [],
      fuel: [],
      settings: EMPTY_SETTINGS,
      period: "month",
      today: parseISODate("2024-02-10"),
    }),
  )
  assert.equal(leap.end, "2024-02-29")

  const sunday = ready(
    computeHourly({
      shifts: [],
      fuel: [],
      settings: EMPTY_SETTINGS,
      period: "week",
      today: parseISODate("2026-10-25"),
    }),
  )
  assert.equal(sunday.start, "2026-10-19")
  assert.equal(sunday.end, "2026-10-25")

  const crossing = ready(
    computeHourly({
      shifts: [],
      fuel: [],
      settings: EMPTY_SETTINGS,
      period: "last7",
      today: parseISODate("2026-10-01"),
    }),
  )
  assert.equal(crossing.start, "2026-09-25")
  assert.equal(crossing.end, "2026-10-01")
})

test("custom ranges need two ordered dates and do not need the clock", () => {
  assert.equal(
    computeHourly({
      shifts: [],
      fuel: [],
      settings: EMPTY_SETTINGS,
      period: "custom",
      today: null,
      customStart: "",
      customEnd: "",
    }).status,
    "needs-dates",
  )
  assert.equal(
    computeHourly({
      shifts: [],
      fuel: [],
      settings: EMPTY_SETTINGS,
      period: "custom",
      today: TODAY,
      customStart: "2026-10-10",
      customEnd: "2026-10-01",
    }).status,
    "invalid-range",
  )
  assert.equal(
    computeHourly({
      shifts: [],
      fuel: [],
      settings: EMPTY_SETTINGS,
      period: "custom",
      today: TODAY,
      customStart: "2026-02-31",
      customEnd: "2026-03-01",
    }).status,
    "invalid-range",
  )
  const report = ready(
    computeHourly({
      shifts: [
        shift({ date: "2026-10-02", start: "10:00", end: "12:00", earnings: 40 }),
        shift({ date: "2026-10-03", start: "10:00", end: "11:00", earnings: 10 }),
      ],
      fuel: [],
      settings: EMPTY_SETTINGS,
      period: "custom",
      today: null,
      customStart: "2026-10-02",
      customEnd: "2026-10-02",
    }),
  )
  assert.equal(report.shiftCount, 1)
  assert.equal(report.grossHourly, 20)
})

test("week, last 7 days, and this month wait for the device date", () => {
  for (const period of ["today", "week", "last7", "month"] as const) {
    assert.equal(
      computeHourly({
        shifts: [shift({ date: "2026-10-21", start: "16:00", end: "19:00", earnings: 70 })],
        fuel: [],
        settings: EMPTY_SETTINGS,
        period,
        today: null,
      }).status,
      "pending-clock",
    )
  }
})

test("ranking keeps the five highest gross hourly shifts", () => {
  const shifts = [10, 20, 30, 40, 50, 60].map((earnings, index) =>
    shift({
      id: `s-${earnings}`,
      date: `2026-10-${String(index + 1).padStart(2, "0")}`,
      start: "10:00",
      end: "11:00",
      earnings,
    }),
  )
  const report = ready(
    computeHourly({
      shifts,
      fuel: [],
      settings: EMPTY_SETTINGS,
      period: "month",
      today: TODAY,
    }),
  )
  assert.deepEqual(
    report.ranking.map((line) => line.earnings),
    [60, 50, 40, 30, 20],
  )
  assert.equal(report.best?.earnings, 60)
  assert.equal(report.grossHourly, 35)
})
