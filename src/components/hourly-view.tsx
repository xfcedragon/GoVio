"use client"

import { useId, useMemo, useState } from "react"
import Link from "next/link"
import { Pencil, Timer, Trash2 } from "lucide-react"
import { EmptyState } from "@/components/empty-state"
import { controlClass, Field } from "@/components/field"
import { Numeric } from "@/components/numeric"
import { PageHeader } from "@/components/page-header"
import { SegmentedControl } from "@/components/segmented-control"
import { StatCard } from "@/components/stat-card"
import { Button } from "@/components/ui/button"
import { formatMonthDay, formatTime, formatWeekdayDate } from "@/lib/dates"
import { countLabel, formatCad, formatHours, formatKm } from "@/lib/format"
import {
  computeHourly,
  type HourlyDayBar,
  type HourlyPeriod,
  type HourlyReport,
  type HourlyResult,
  type HourlyShiftLine,
} from "@/lib/hourly"
import { useSkipPilot } from "@/lib/store"

const PERIOD_OPTIONS: { value: HourlyPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "last7", label: "Last 7 days" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
]

function perHour(value: number | null): string {
  if (value === null) return "—"
  return `${formatCad(value)}/h`
}

function rangeLabel(result: HourlyResult): string {
  if (result.status === "pending-clock") return "Uses the date on this device"
  if (result.status === "needs-dates") return "Choose a start and an end"
  if (result.status === "invalid-range") return "End date is before the start"
  if (result.report.start === null || result.report.end === null) return "Every shift on this device"
  if (result.report.start === result.report.end) return formatWeekdayDate(result.report.start)
  return `${formatWeekdayDate(result.report.start)} – ${formatWeekdayDate(result.report.end)}`
}

function grossHint(result: HourlyResult): string {
  if (result.status === "pending-clock") return "Uses the date on this device"
  if (result.status !== "ready") return "Choose a valid range"
  const { report } = result
  if (report.grossHourly === null) {
    return report.excludedCount > 0
      ? "Shifts in this period have no usable duration"
      : "No shifts in this period"
  }
  return `${formatCad(report.totalEarnings)} ÷ ${formatHours(report.totalHours)}`
}

function netHint(result: HourlyResult): string {
  if (result.status === "pending-clock") return "Uses the date on this device"
  if (result.status !== "ready") return "Choose a valid range"
  const { report } = result
  if (report.estimatedNetHourly === null || report.consumedFuel === null) {
    if (report.consumptionGap === "no-hours") return "Needs shifts with usable hours"
    if (report.consumptionGap === "no-rates") return "Save L/100 km and a pump price to estimate fuel consumed"
    return "Kilometres are missing, so fuel consumed is unavailable"
  }
  return `Estimate · ${formatCad(report.totalEarnings)} minus ${formatCad(report.consumedFuel)} consumed`
}

function consumptionCardHint(result: HourlyResult, litres: number | null, price: number | null): string {
  if (result.status === "pending-clock") return "Uses the date on this device"
  if (result.status !== "ready") return "Choose a valid range"
  const { report } = result
  if (report.consumedFuel === null) {
    if (report.consumptionGap === "no-hours") return "Needs shifts with usable hours"
    if (report.consumptionGap === "no-rates") return "Save L/100 km and a pump price in Settings"
    return "Needs kilometres on the shifts in this period"
  }
  if (litres === null || price === null) return "Distance estimate"
  return `${formatKm(report.kilometres)} × ${litres} L/100 km × ${formatCad(price)}/L`
}

function cashHint(result: HourlyResult): string {
  if (result.status === "pending-clock") return "Uses the date on this device"
  if (result.status !== "ready") return "Choose a valid range"
  const { report } = result
  if (report.fillupSpend === null || report.cashFlowAfterFillups === null) {
    return "No fill-up is dated in this period"
  }
  return `${formatCad(report.totalEarnings)} minus ${formatCad(report.fillupSpend)} paid at the pump`
}

function emptyCopy(
  result: HourlyResult,
  savedShiftCount: number,
): { title: string; body: string } {
  if (result.status === "pending-clock") {
    return {
      title: "This period uses the device date",
      body: "Today, this week, the last 7 days, and this month fill in from the date on this device. All time is available without it.",
    }
  }
  if (result.status === "needs-dates") {
    return {
      title: "Choose a date range",
      body: "Set a start and an end. Totals include shifts dated on both of those days.",
    }
  }
  if (result.status === "invalid-range") {
    return {
      title: "Check the date range",
      body: "The end date needs to be the same day as the start, or a later day. February dates have to be real calendar days.",
    }
  }
  if (savedShiftCount === 0) {
    return {
      title: "No shifts yet",
      body: "Add a shift with the payout and the clock times. Hours come from those times. A shift is never treated as one hour by default.",
    }
  }
  if (result.report.excludedCount > 0 && result.report.shiftCount === 0) {
    return {
      title: "No usable hours in this period",
      body: "These shifts need a start and end that produce hours. Matching clock times count as 0 hours and stay out of the rate. An overnight finish, where the end is earlier than the start, is included.",
    }
  }
  return {
    title: "No shifts in this period",
    body: "Nothing logged falls on these dates. Try another period, or add the shift you just finished.",
  }
}

function netCellTitle(line: HourlyShiftLine, ratesReady: boolean): string | undefined {
  if (line.estimatedNetHourly !== null) return undefined
  if (!ratesReady) return "Save L/100 km and a pump price to estimate fuel consumed"
  if (line.kilometres <= 0) return "No kilometres on this shift, so consumed fuel is not estimated"
  return "Estimated net is unavailable for this shift"
}

function HourlyDayChart({ days }: { days: HourlyDayBar[] }) {
  const titleId = useId()
  const width = Math.max(days.length * 56 + 72, 320)
  const height = 228
  const padLeft = 64
  const padRight = 12
  const padTop = 28
  const padBottom = 36
  const innerWidth = width - padLeft - padRight
  const innerHeight = height - padTop - padBottom
  const peak = Math.max(...days.map((day) => day.grossHourly), 0)
  const slot = innerWidth / days.length
  const barWidth = Math.min(36, slot * 0.55)

  return (
    <div className="overflow-x-auto px-3 pt-2 pb-4">
      <svg
        role="img"
        aria-labelledby={titleId}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="max-w-none"
        style={{ fontFamily: "var(--font-plex), ui-monospace, monospace" }}
      >
        <title id={titleId}>Gross earnings per hour by day</title>
        {[0, 0.5, 1].map((step) => {
          const y = padTop + innerHeight - (peak > 0 ? step * innerHeight : 0)
          const value = peak > 0 ? peak * step : 0
          return (
            <g key={step}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                stroke="rgb(255 255 255 / 12%)"
              />
              <text x={padLeft - 8} y={y + 3} textAnchor="end" fill="var(--muted-foreground)" fontSize="10">
                {formatCad(value)}
              </text>
            </g>
          )
        })}
        {days.map((day, index) => {
          const barHeight = peak > 0 ? (day.grossHourly / peak) * innerHeight : 0
          const x = padLeft + index * slot + (slot - barWidth) / 2
          const y = padTop + innerHeight - barHeight
          const drawnHeight = Math.max(barHeight, 2)
          const label = days.length > 12 ? day.date.slice(8) : formatMonthDay(day.date)
          return (
            <g key={day.date}>
              <title>
                {`${formatWeekdayDate(day.date)}: ${formatCad(day.grossHourly)} per hour, ${formatCad(day.earnings)} over ${formatHours(day.hours)}`}
              </title>
              {days.length <= 10 ? (
                <text
                  x={x + barWidth / 2}
                  y={Math.max(12, y - 6)}
                  textAnchor="middle"
                  fill="var(--foreground)"
                  fontSize="10"
                >
                  {formatCad(day.grossHourly)}
                </text>
              ) : null}
              <rect
                x={x}
                y={barHeight === 0 ? padTop + innerHeight - 2 : y}
                width={barWidth}
                height={drawnHeight}
                rx={4}
                fill="var(--primary)"
              />
              <text
                x={x + barWidth / 2}
                y={height - 12}
                textAnchor="middle"
                fill="var(--muted-foreground)"
                fontSize="10"
              >
                {label}
              </text>
            </g>
          )
        })}
      </svg>
      <ul className="sr-only">
        {days.map((day) => (
          <li key={day.date}>
            {formatWeekdayDate(day.date)}: {formatCad(day.grossHourly)} per hour
          </li>
        ))}
      </ul>
    </div>
  )
}

function HourlyTable({ lines, ratesReady }: { lines: HourlyShiftLine[]; ratesReady: boolean }) {
  const { data, openShift, requestDeleteShift } = useSkipPilot()
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-sm">
        <caption className="sr-only">Hourly earnings for shifts in this period</caption>
        <thead>
          <tr className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            <th className="px-5 py-3 font-medium">Date</th>
            <th className="px-3 py-3 font-medium">Hours</th>
            <th className="px-3 py-3 font-medium">Gross</th>
            <th className="px-3 py-3 font-medium">Gross/h</th>
            <th className="px-3 py-3 font-medium">Est. net/h</th>
            <th className="px-5 py-3 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-t border-border transition-colors hover:bg-white/[0.03]">
              <td className="px-5 py-3 align-top">
                <div className="font-medium text-foreground">{formatWeekdayDate(line.date)}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {formatTime(line.start)} – {formatTime(line.end)}
                  {line.area ? ` · ${line.area}` : ""}
                </div>
              </td>
              <td className="px-3 py-3 align-top whitespace-nowrap">
                <Numeric>{formatHours(line.hours)}</Numeric>
                <div className="mt-0.5 text-xs text-muted-foreground">{formatKm(line.kilometres)}</div>
              </td>
              <td className="px-3 py-3 align-top whitespace-nowrap">
                <Numeric tone={line.earnings > 0 ? "positive" : "default"}>{formatCad(line.earnings)}</Numeric>
              </td>
              <td className="px-3 py-3 align-top whitespace-nowrap">
                <Numeric tone={line.grossHourly > 0 ? "positive" : "default"}>{perHour(line.grossHourly)}</Numeric>
              </td>
              <td className="px-3 py-3 align-top whitespace-nowrap" title={netCellTitle(line, ratesReady)}>
                <Numeric
                  tone={
                    line.estimatedNetHourly === null
                      ? "muted"
                      : line.estimatedNetHourly < 0
                        ? "warning"
                        : "positive"
                  }
                >
                  {perHour(line.estimatedNetHourly)}
                </Numeric>
              </td>
              <td className="px-4 py-2 text-right align-top">
                <div className="flex justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit shift on ${formatWeekdayDate(line.date)}`}
                    onClick={() => {
                      const saved = data.shifts.find((item) => item.id === line.id)
                      if (saved) openShift(saved)
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete shift on ${formatWeekdayDate(line.date)}`}
                    onClick={() => requestDeleteShift(line.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function HourlyView() {
  const { now, data, openShift } = useSkipPilot()
  const [period, setPeriod] = useState<HourlyPeriod>("week")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")

  const result = useMemo(
    () =>
      computeHourly({
        shifts: data.shifts,
        fuel: data.fuel,
        settings: data.settings,
        period,
        today: now,
        customStart,
        customEnd,
      }),
    [customEnd, customStart, data.fuel, data.settings, data.shifts, now, period],
  )

  const report: HourlyReport | null = result.status === "ready" ? result.report : null
  const ratesReady = report !== null && report.consumptionGap !== "no-rates" && report.consumptionGap !== "no-hours"
  const empty = emptyCopy(result, data.shifts.length)
  const hasLines = report !== null && report.lines.length > 0
  const netTone =
    report?.estimatedNetHourly == null
      ? "default"
      : report.estimatedNetHourly < 0
        ? "warning"
        : "positive"
  const cashTone =
    report?.cashFlowAfterFillups == null
      ? "default"
      : report.cashFlowAfterFillups < 0
        ? "warning"
        : report.cashFlowAfterFillups > 0
          ? "positive"
          : "default"

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Hourly earnings"
        title="What each hour paid"
        description="Gross hourly is this period's payout divided by the hours on the clock. A 3-hour shift weighs three times a 1-hour shift. Hours come from the start and end you entered, including a finish after midnight."
        actions={
          <Button type="button" className="h-10 px-3.5" onClick={() => openShift()}>
            Add shift
          </Button>
        }
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedControl
            label="Hourly earnings period"
            value={period}
            onChange={setPeriod}
            options={PERIOD_OPTIONS}
          />
          <p className="text-sm text-muted-foreground">{rangeLabel(result)}</p>
        </div>
        {period === "custom" ? (
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <Field label="From" htmlFor="hourly-from" hint="First day included">
              <input
                type="date"
                className={controlClass}
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
              />
            </Field>
            <Field label="To" htmlFor="hourly-to" hint="Last day included">
              <input
                type="date"
                className={controlClass}
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
              />
            </Field>
          </div>
        ) : null}
      </div>

      <section aria-label="Hourly summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          featured
          label="Gross per hour"
          value={perHour(report?.grossHourly ?? null)}
          tone={report?.grossHourly != null && report.grossHourly > 0 ? "positive" : "default"}
          hint={grossHint(result)}
        />
        <StatCard
          label="Estimated net per hour"
          value={perHour(report?.estimatedNetHourly ?? null)}
          tone={netTone}
          hint={netHint(result)}
        />
        <StatCard
          label="Hours worked"
          value={report && report.shiftCount > 0 ? formatHours(report.totalHours) : "—"}
          hint={
            report && report.shiftCount > 0
              ? countLabel(report.shiftCount, "shift")
              : "Shifts with a real start and end"
          }
        />
        <StatCard
          label="Gross earnings"
          value={report && report.shiftCount > 0 ? formatCad(report.totalEarnings) : "—"}
          tone={report && report.totalEarnings > 0 ? "positive" : "default"}
          hint="Payout before fuel"
        />
        <StatCard
          label="Best-paying shift"
          value={perHour(report?.best?.grossHourly ?? null)}
          tone={report?.best && report.best.grossHourly > 0 ? "positive" : "default"}
          hint={
            report?.best
              ? `${formatWeekdayDate(report.best.date)} · ${formatTime(report.best.start)} – ${formatTime(report.best.end)} · ${formatCad(report.best.earnings)} over ${formatHours(report.best.hours)}`
              : "Highest gross hourly rate in this period"
          }
        />
        <StatCard
          label="Average per shift"
          value={report?.averagePerShift == null ? "—" : formatCad(report.averagePerShift)}
          hint="Gross payout ÷ shifts with usable hours"
        />
      </section>

      {report && report.excludedCount > 0 && report.shiftCount > 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">
          {report.excludedCount === 1
            ? "1 shift in this period is left out of these rates. It needs clock times that produce hours. Matching start and end count as 0 hours."
            : `${report.excludedCount} shifts in this period are left out of these rates. Each needs clock times that produce hours. Matching start and end count as 0 hours.`}
        </p>
      ) : null}

      <section aria-label="Fuel consumed and fill-up cash flow" className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <StatCard
            label="Fuel consumed"
            value={report?.consumedFuel == null ? "—" : formatCad(report.consumedFuel)}
            hint={consumptionCardHint(result, data.settings.litresPer100km, data.settings.fuelPricePerLitre)}
          />
          <StatCard
            label="Fill-ups in period"
            value={report?.fillupSpend == null ? "—" : formatCad(report.fillupSpend)}
            hint={
              report?.fillupSpend == null
                ? "Cash paid at the pump. Separate from fuel consumed."
                : "Receipts dated in this period. Separate from fuel consumed."
            }
          />
          <StatCard
            label="Cash flow after fill-ups"
            value={report?.cashFlowAfterFillups == null ? "—" : formatCad(report.cashFlowAfterFillups)}
            tone={cashTone}
            hint={cashHint(result)}
          />
        </div>
        <div className="rounded-2xl border border-border bg-card px-5 py-4 text-sm leading-6 text-muted-foreground">
          <h2 className="text-base font-semibold text-foreground">Three different figures</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Gross per hour is payout divided by hours. Fuel is not part of it.</li>
            <li>
              Estimated net per hour subtracts fuel consumed: kilometres × your L/100 km × your pump price,
              then divides by hours. It is an estimate of fuel burned.{" "}
              <Link href="/settings" className="text-primary hover:underline">
                Vehicle rates
              </Link>{" "}
              live in Settings.
            </li>
            <li>
              Cash flow after fill-ups subtracts receipt totals dated in this period. That is cash paid at the
              pump. A fill-up can cover driving outside these shifts, so the receipt stays out of estimated net.
            </li>
          </ol>
        </div>
      </section>

      {hasLines && report ? (
        <>
          <div className="grid gap-4 xl:grid-cols-12">
            <section className="overflow-hidden rounded-2xl border border-border bg-card xl:col-span-7">
              <div className="px-5 py-4">
                <h2 className="text-base font-semibold">Gross per hour by day</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Each bar is that day&apos;s payout divided by that day&apos;s hours.
                </p>
              </div>
              <HourlyDayChart days={report.days} />
            </section>
            <section className="overflow-hidden rounded-2xl border border-border bg-card xl:col-span-5">
              <div className="px-5 py-4">
                <h2 className="text-base font-semibold">Highest gross hourly</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ranked by each shift&apos;s own payout divided by its hours.
                </p>
              </div>
              <ol className="border-t border-border">
                {report.ranking.map((line, index) => (
                  <li
                    key={line.id}
                    className="flex items-baseline justify-between gap-3 border-t border-border px-5 py-3 first:border-t-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        <span className="mr-2 text-muted-foreground">{index + 1}</span>
                        {formatWeekdayDate(line.date)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatTime(line.start)} – {formatTime(line.end)} · {formatHours(line.hours)} ·{" "}
                        {formatCad(line.earnings)}
                      </p>
                    </div>
                    <Numeric tone="positive" className="shrink-0">
                      {perHour(line.grossHourly)}
                    </Numeric>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="px-5 py-4">
              <h2 className="text-base font-semibold">Shifts in this period</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Estimated net on a row is that shift&apos;s payout minus its kilometres × L/100 km × pump price,
                divided by its hours. A row with no kilometres shows — because that model has no distance to
                price. Those hours still count in the period totals.
              </p>
            </div>
            <HourlyTable lines={report.lines} ratesReady={ratesReady} />
          </section>
        </>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <EmptyState
            icon={Timer}
            title={empty.title}
            body={empty.body}
            actions={
              <>
                <Button type="button" className="h-10 px-3.5" onClick={() => openShift()}>
                  Add shift
                </Button>
                {report && data.shifts.length > 0 && period !== "all" ? (
                  <Button type="button" variant="outline" className="h-10 px-3.5" onClick={() => setPeriod("all")}>
                    Show all time
                  </Button>
                ) : null}
              </>
            }
          />
        </section>
      )}
    </div>
  )
}
