"use client"

import { useId, useMemo, useState } from "react"
import Link from "next/link"
import { Pencil, Trash2 } from "lucide-react"
import { EmptyState } from "@/components/empty-state"
import { controlClass, Field, textLinkClass } from "@/components/field"
import { Numeric } from "@/components/numeric"
import { PageHeader } from "@/components/page-header"
import { SegmentedControl } from "@/components/segmented-control"
import { FigureRow, LeadFigure } from "@/components/stat-card"
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
  if (value === null) return "Unavailable"
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
                stroke="rgb(255 255 255 / 8%)"
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
                  fill="var(--muted-foreground)"
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
                rx={1}
                fill="var(--chart-1)"
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
          <tr className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <th className="px-3 py-2 text-left font-medium">Date</th>
            <th className="px-3 py-2 text-right font-medium">Hours</th>
            <th className="px-3 py-2 text-right font-medium">Gross</th>
            <th className="px-3 py-2 text-right font-medium">Gross/h</th>
            <th className="px-3 py-2 text-right font-medium">Est. net/h</th>
            <th className="px-3 py-2 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-t border-border transition-colors hover:bg-white/[0.03]">
              <td className="px-3 py-2 align-top">
                <div className="font-medium text-foreground">{formatWeekdayDate(line.date)}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {formatTime(line.start)} – {formatTime(line.end)}
                  {line.area ? ` · ${line.area}` : ""}
                </div>
              </td>
              <td className="px-3 py-2 text-right align-top whitespace-nowrap">
                <Numeric>{formatHours(line.hours)}</Numeric>
                <div className="mt-0.5 text-xs text-muted-foreground">{formatKm(line.kilometres)}</div>
              </td>
              <td className="px-3 py-2 text-right align-top whitespace-nowrap">
                <Numeric tone={line.earnings > 0 ? "positive" : "default"}>{formatCad(line.earnings)}</Numeric>
              </td>
              <td className="px-3 py-2 text-right align-top whitespace-nowrap">
                <Numeric tone={line.grossHourly > 0 ? "positive" : "default"}>{perHour(line.grossHourly)}</Numeric>
              </td>
              <td className="px-3 py-2 text-right align-top whitespace-nowrap" title={netCellTitle(line, ratesReady)}>
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
      ? "muted"
      : report.estimatedNetHourly < 0
        ? "warning"
        : "positive"
  const cashTone =
    report?.cashFlowAfterFillups == null
      ? "muted"
      : report.cashFlowAfterFillups < 0
        ? "warning"
        : report.cashFlowAfterFillups > 0
          ? "positive"
          : "default"
  const worst =
    report && report.lines.length > 0
      ? report.lines.reduce((low, line) => (line.grossHourly < low.grossHourly ? line : low))
      : null
  const showWorst = worst !== null && report?.best != null && worst.id !== report.best.id
  const hasHours = report !== null && report.shiftCount > 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="Earnings"
        description="Gross / hour is this period's eligible payout divided by hours on the clock. A longer shift weighs more. Estimated net subtracts fuel consumed only."
        actions={
          <Button type="button" className="h-8 px-3" onClick={() => openShift()}>
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

      <section aria-label="Hourly summary" className="overflow-hidden rounded-md border border-border bg-card">
        <div className="grid lg:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)]">
          <div className="border-b border-border px-3 py-3 lg:border-r lg:border-b-0">
            <LeadFigure
              label="Gross / hour"
              value={hasHours ? perHour(report?.grossHourly ?? null) : "—"}
              tone={report?.grossHourly != null && report.grossHourly > 0 ? "positive" : "muted"}
              hint={grossHint(result)}
            />
          </div>
          <div className="px-3 py-3">
        <FigureRow
          columns="grid-cols-2 lg:grid-cols-3"
          items={[
            {
              label: "Total gross",
              value: hasHours && report ? formatCad(report.totalEarnings) : "—",
              tone: hasHours && report && report.totalEarnings > 0 ? "positive" : "muted",
              hint:
                report?.averagePerShift == null
                  ? "Payout before fuel"
                  : `Average per shift ${formatCad(report.averagePerShift)}`,
            },
            {
              label: "Total hours",
              value: hasHours && report ? formatHours(report.totalHours) : "—",
              tone: hasHours ? "default" : "muted",
              hint: hasHours && report ? countLabel(report.shiftCount, "shift") : "Shifts with a real start and end",
            },
            {
              label: "Net / hour",
              value: hasHours ? perHour(report?.estimatedNetHourly ?? null) : "—",
              tone: hasHours ? netTone : "muted",
              hint: netHint(result),
            },
          ]}
        />
        <div className="mt-3 border-t border-border pt-3">
          <FigureRow
            columns="grid-cols-1 sm:grid-cols-3"
            items={[
              {
                label: "Est. fuel consumed",
                value: report ? (report.consumedFuel == null ? "Unavailable" : formatCad(report.consumedFuel)) : "—",
                tone: report?.consumedFuel == null ? "muted" : "default",
                hint: consumptionCardHint(result, data.settings.litresPer100km, data.settings.fuelPricePerLitre),
              },
              {
                label: "Fuel purchases",
                value: report ? (report.fillupSpend == null ? "Unavailable" : formatCad(report.fillupSpend)) : "—",
                tone: report?.fillupSpend == null ? "muted" : "default",
                hint:
                  report?.fillupSpend == null
                    ? "Cash paid at the pump. Separate from fuel consumed."
                    : "Receipts dated in this period. Separate from fuel consumed.",
              },
              {
                label: "Cash after fill-ups",
                value: report
                  ? report.cashFlowAfterFillups == null
                    ? "Unavailable"
                    : formatCad(report.cashFlowAfterFillups)
                  : "—",
                tone: cashTone,
                hint: cashHint(result),
              },
            ]}
          />
        </div>
          </div>
        </div>
      </section>

      {report && report.excludedCount > 0 && report.shiftCount > 0 ? (
        <p className="text-sm leading-5 text-muted-foreground">
          {report.excludedCount === 1
            ? "1 shift in this period is left out of these rates. It needs clock times that produce hours. Matching start and end count as 0 hours."
            : `${report.excludedCount} shifts in this period are left out of these rates. Each needs clock times that produce hours. Matching start and end count as 0 hours.`}
        </p>
      ) : null}

      <section className="rounded-md border border-border bg-card px-3 py-3 text-sm leading-5 text-muted-foreground">
        <h2 className="text-[11px] font-medium tracking-wide text-foreground uppercase">Three different figures</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Gross / hour is payout divided by hours. Fuel is not part of it.</li>
          <li>
            Net / hour subtracts fuel consumed: kilometres × your L/100 km × your pump price, then divides by hours.
            It is an estimate of fuel burned.{" "}
            <Link href="/settings" className={textLinkClass}>
              Vehicle rates
            </Link>{" "}
            live in Settings.
          </li>
          <li>
            Cash after fill-ups subtracts receipt totals dated in this period. That is cash paid at the pump. A
            fill-up can cover driving outside these shifts, so the receipt stays out of estimated net.
          </li>
        </ol>
      </section>

      {hasLines && report ? (
        <>
          <div className="grid gap-4 xl:grid-cols-12">
            <section className="overflow-hidden rounded-md border border-border bg-card xl:col-span-7">
              <div className="border-b border-border px-3 py-2">
                <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Gross / hour by day
                </h2>
              </div>
              <HourlyDayChart days={report.days} />
            </section>
            <section className="overflow-hidden rounded-md border border-border bg-card xl:col-span-5">
              <div className="border-b border-border px-3 py-2">
                <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Gross / hour by shift
                </h2>
              </div>
              {report.best ? (
                <div className={`grid ${showWorst ? "grid-cols-2" : "grid-cols-1"} border-b border-border`}>
                  <div className="px-3 py-2">
                    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Best</p>
                    <Numeric tone="positive" className="mt-1 text-sm">
                      {perHour(report.best.grossHourly)}
                    </Numeric>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatWeekdayDate(report.best.date)}</p>
                  </div>
                  {showWorst && worst ? (
                    <div className="border-l border-border px-3 py-2">
                      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Worst</p>
                      <Numeric className="mt-1 text-sm">{perHour(worst.grossHourly)}</Numeric>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatWeekdayDate(worst.date)}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <ol>
                {report.ranking.map((line, index) => (
                  <li
                    key={line.id}
                    className="flex items-baseline justify-between gap-3 border-t border-border px-3 py-2 first:border-t-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">
                        <span className="mr-2 text-muted-foreground">{index + 1}</span>
                        {formatWeekdayDate(line.date)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatTime(line.start)} – {formatTime(line.end)} · {formatHours(line.hours)} ·{" "}
                        {formatCad(line.earnings)}
                      </p>
                    </div>
                    <Numeric tone={line.grossHourly > 0 ? "positive" : "default"} className="shrink-0">
                      {perHour(line.grossHourly)}
                    </Numeric>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <section className="overflow-hidden rounded-md border border-border bg-card">
            <div className="border-b border-border px-3 py-2">
              <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Shifts in this period
              </h2>
              <p className="mt-1 text-xs leading-4 text-muted-foreground">
                Estimated net on a row is that shift&apos;s payout minus its kilometres × L/100 km × pump price,
                divided by its hours. A row with no kilometres shows Unavailable. Those hours still count in the
                period totals.
              </p>
            </div>
            <HourlyTable lines={report.lines} ratesReady={ratesReady} />
          </section>
        </>
      ) : (
        <section className="overflow-hidden rounded-md border border-border bg-card">
          <EmptyState
            title={empty.title}
            body={empty.body}
            actions={
              <>
                <Button type="button" className="h-8 px-3" onClick={() => openShift()}>
                  Add shift
                </Button>
                {report && data.shifts.length > 0 && period !== "all" ? (
                  <Button type="button" variant="outline" className="h-8 px-3" onClick={() => setPeriod("all")}>
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
