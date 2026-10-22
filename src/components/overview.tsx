"use client"

import Link from "next/link"
import { useMemo } from "react"
import { textLinkClass } from "@/components/field"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { Section } from "@/components/page-header"
import { FigureRow, type FigureTone } from "@/components/stat-card"
import { ShiftsTable } from "@/components/shifts-table"
import { WeeklyTargetCard } from "@/components/weekly-target"
import { Numeric } from "@/components/numeric"
import { BillList } from "@/components/bill-list"
import { formatLongDate, formatMonthDay } from "@/lib/dates"
import { formatCad, formatHours, formatKm, formatLitres } from "@/lib/format"
import { computeHourly, type HourlyReport } from "@/lib/hourly"
import { compareShiftsDesc } from "@/lib/metrics"
import { useSkipPilot } from "@/lib/store"
import { PROVINCES } from "@/lib/types"
import { categoryLabel } from "@/lib/vehicle"
import { cn } from "@/lib/utils"

function rateText(value: number | null, known: boolean): string {
  if (!known) return "—"
  if (value === null) return "Unavailable"
  return `${formatCad(value)}/h`
}

function moneyText(value: number | null, known: boolean): string {
  if (!known) return "—"
  if (value === null) return "Unavailable"
  return formatCad(value)
}

function earnTone(value: number | null, known: boolean): FigureTone {
  if (!known || value === null) return "muted"
  if (value > 0) return "positive"
  if (value < 0) return "warning"
  return "default"
}

function netTone(value: number | null, known: boolean): FigureTone {
  if (!known || value === null) return "muted"
  if (value < 0) return "warning"
  if (value > 0) return "positive"
  return "default"
}

function consumedHint(report: HourlyReport | null): string {
  if (!report) return "Uses the date on this device"
  if (report.consumedFuel !== null) return "Estimate · km × L/100 km × pump price"
  if (report.consumptionGap === "no-rates") return "Needs L/100 km and a pump price"
  if (report.consumptionGap === "no-kilometres") return "Needs kilometres on these shifts"
  if (report.consumptionGap === "no-hours") return "Needs shifts with usable hours"
  return "Estimate unavailable"
}

export function Overview() {
  const { now, data, metrics, demo, openShift, openFuel, openBill, requestSample } = useSkipPilot()

  const hourly = useMemo(
    () =>
      computeHourly({
        shifts: data.shifts,
        fuel: data.fuel,
        settings: data.settings,
        period: "week",
        today: now,
      }),
    [data.fuel, data.settings, data.shifts, now],
  )
  const report = hourly.status === "ready" ? hourly.report : null
  const hasEligible = report !== null && report.shiftCount > 0
  const province = PROVINCES.find((item) => item.code === data.settings.province)?.name
  const recent = [...data.shifts].sort(compareShiftsDesc).slice(0, 5)
  const weekShifts = metrics
    ? data.shifts.filter((shift) => shift.date >= metrics.weekStartIso && shift.date <= metrics.weekEndIso)
    : []
  const weekFuel = metrics
    ? data.fuel
        .filter((fill) => fill.date >= metrics.weekStartIso && fill.date <= metrics.weekEndIso)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    : []
  const weekExpenses = metrics
    ? data.expenses
        .filter((expense) => expense.date >= metrics.weekStartIso && expense.date <= metrics.weekEndIso)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    : []
  const upcoming = data.bills
    .filter((bill) => !bill.paid)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name))
    .slice(0, 4)
  const showMileage = metrics !== null && (metrics.week.kilometres > 0 || metrics.allTime.kilometres > 0)
  const peakDay = report ? Math.max(...report.days.map((day) => day.earnings), 0) : 0

  const periodLabel = metrics
    ? `${formatMonthDay(metrics.weekStartIso)} – ${formatMonthDay(metrics.weekEndIso)}`
    : "Date on this device"

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-lg font-medium tracking-tight text-foreground">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {now ? formatLongDate(now) : "—"}
            {province ? ` · ${province}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-8 px-3" onClick={() => openFuel()}>
            Log fill-up
          </Button>
          <Button type="button" className="h-8 px-3" onClick={() => openShift()}>
            Add shift
          </Button>
        </div>
      </div>

      <section aria-label="Earnings summary" className="rounded-md border border-border bg-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 pt-3">
          <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">This week</h2>
          <p className="text-xs text-muted-foreground">
            {periodLabel}
            {" · CAD"}
          </p>
        </div>
        <div className="px-3 py-3">
          <FigureRow
            columns="grid-cols-2 sm:grid-cols-3"
            items={[
              {
                label: "Gross earnings",
                value: hasEligible && report ? formatCad(report.totalEarnings) : report && report.excludedCount > 0 ? "Unavailable" : "—",
                tone: earnTone(hasEligible && report ? report.totalEarnings : null, hasEligible),
                hint: hasEligible && report ? "Eligible payout" : report && report.excludedCount > 0 ? "Clock times do not produce hours" : "No shifts in this week",
              },
              {
                label: "Gross / hour",
                value: rateText(report?.grossHourly ?? null, hasEligible),
                tone: earnTone(report?.grossHourly ?? null, hasEligible && report?.grossHourly != null),
                hint:
                  hasEligible && report && report.grossHourly !== null
                    ? `${formatCad(report.totalEarnings)} ÷ ${formatHours(report.totalHours)}`
                    : "Total eligible gross ÷ total hours",
              },
              {
                label: "Hours worked",
                value: hasEligible && report ? formatHours(report.totalHours) : report && report.excludedCount > 0 ? "Unavailable" : "—",
                tone: hasEligible ? "default" : "muted",
                hint: hasEligible && report ? `${report.shiftCount} with usable hours` : "From clock times",
              },
            ]}
          />
        </div>
        <div className="border-t border-border px-3 py-3">
          <FigureRow
            columns="grid-cols-2 lg:grid-cols-4"
            items={[
              {
                label: "Fuel purchases",
                value: moneyText(report?.fillupSpend ?? null, report !== null),
                tone: report?.fillupSpend == null ? "muted" : "default",
                hint: "Cash at the pump. Not fuel consumed.",
              },
              {
                label: "Est. fuel consumed",
                value: moneyText(report?.consumedFuel ?? null, report !== null),
                tone: report?.consumedFuel == null ? "muted" : "default",
                hint: consumedHint(report),
              },
              {
                label: "Estimated net",
                value: moneyText(report?.estimatedNet ?? null, report !== null),
                tone: netTone(report?.estimatedNet ?? null, report !== null && report?.estimatedNet != null),
                hint: "Gross minus estimated fuel consumed",
              },
              {
                label: "Net / hour",
                value: rateText(report?.estimatedNetHourly ?? null, report !== null),
                tone: netTone(report?.estimatedNetHourly ?? null, report !== null && report?.estimatedNetHourly != null),
                hint: "Estimate. Fill-ups are not subtracted here.",
              },
            ]}
          />
        </div>
        {report && report.excludedCount > 0 ? (
          <p className="border-t border-border px-3 py-2 text-[11px] leading-4 text-muted-foreground">
            {report.excludedCount === 1
              ? "1 shift this week is left out of the hourly figures. Matching start and end count as 0 hours."
              : `${report.excludedCount} shifts this week are left out of the hourly figures. Matching start and end count as 0 hours.`}
          </p>
        ) : null}
        <div className="border-t border-border px-3 py-2.5">
          <WeeklyTargetCard />
        </div>
      </section>

      {report && report.days.length > 0 ? (
        <Section title="Earnings by day" action={<span className="text-[11px] text-muted-foreground">Gross</span>}>
          <div className="space-y-2 px-3 py-3">
            {report.days.map((day) => (
              <div key={day.date} className="grid grid-cols-[5.5rem_1fr_4.5rem_6.25rem] items-center gap-3 text-sm">
                <span className="text-xs text-muted-foreground">{formatMonthDay(day.date)}</span>
                <div className="h-1 bg-white/[0.06]" title={`${formatCad(day.earnings)} over ${formatHours(day.hours)}`}>
                  <div
                    className="h-full bg-chart-1"
                    style={{ width: peakDay > 0 ? `${(day.earnings / peakDay) * 100}%` : "0%" }}
                  />
                </div>
                <span className="text-right text-xs text-muted-foreground">{formatHours(day.hours)}</span>
                <Numeric className="text-right text-xs">{formatCad(day.earnings)}</Numeric>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section
        title="Recent shifts"
        action={
          data.shifts.length > 0 ? (
            <Link href="/shifts" className={cn("text-xs", textLinkClass)}>
              All shifts
            </Link>
          ) : null
        }
      >
        {metrics && weekShifts.length === 0 && recent.length > 0 ? (
          <p className="border-b border-border px-3 py-2 text-sm text-muted-foreground">No shifts recorded this week.</p>
        ) : null}
        {recent.length > 0 ? (
          <ShiftsTable shifts={recent} compact />
        ) : (
          <EmptyState
            title="No shifts recorded this week."
            body="Add a shift after you cash out. Sample figures stay labelled and can be cleared."
            actions={
              <>
                <Button type="button" className="h-8 px-3" onClick={() => openShift()}>
                  Add shift
                </Button>
                {demo ? null : (
                  <Button type="button" variant="outline" className="h-8 px-3" onClick={requestSample}>
                    Preview sample week
                  </Button>
                )}
              </>
            }
          />
        )}
      </Section>

      <Section
        title="Expenses"
        action={
          <Link href="/fuel" className={cn("text-xs", textLinkClass)}>
            Fuel
          </Link>
        }
      >
        {weekFuel.length === 0 && weekExpenses.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">
            {metrics ? "No fuel purchases recorded this week." : "Fuel purchases use the date on this device."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <caption className="sr-only">Expenses this week</caption>
              <thead>
                <tr className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Merchant</th>
                  <th className="px-3 py-2 font-medium">Detail</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {weekFuel.map((fill) => (
                  <tr key={fill.id} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap">{formatMonthDay(fill.date)}</td>
                    <td className="px-3 py-2">{fill.station || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">Fuel · {formatLitres(fill.litres)}</td>
                    <td className="px-3 py-2 text-right">
                      <Numeric>{formatCad(fill.total)}</Numeric>
                    </td>
                  </tr>
                ))}
                {weekExpenses.map((expense) => (
                  <tr key={expense.id} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap">{formatMonthDay(expense.date)}</td>
                    <td className="px-3 py-2">{expense.merchant || "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{categoryLabel(expense.category)}</td>
                    <td className="px-3 py-2 text-right">
                      <Numeric>{formatCad(expense.total)}</Numeric>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {showMileage && metrics ? (
        <Section
          title="Mileage"
          action={
            <Link href="/vehicle#mileage" className={cn("text-xs", textLinkClass)}>
              Vehicle
            </Link>
          }
        >
          <dl className="grid grid-cols-2 gap-4 px-3 py-3 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">This week</dt>
              <dd className="mt-1">
                <Numeric>{formatKm(metrics.week.kilometres)}</Numeric>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">All time</dt>
              <dd className="mt-1">
                <Numeric>{formatKm(metrics.allTime.kilometres)}</Numeric>
              </dd>
            </div>
          </dl>
        </Section>
      ) : null}

      <Section
        title="Bills"
        action={
          data.bills.some((bill) => !bill.paid) ? (
            <Link href="/bills" className={cn("text-xs", textLinkClass)}>
              All bills
            </Link>
          ) : null
        }
      >
        {upcoming.length > 0 ? (
          <>
            <BillList bills={upcoming} todayIso={metrics?.todayIso ?? null} compact />
            <div className="border-t border-border px-3 py-2">
              <Button type="button" variant="outline" className="h-8" onClick={() => openBill()}>
                Add bill
              </Button>
            </div>
          </>
        ) : (
          <EmptyState
            title="No upcoming bills"
            body="Add a bill if you want the due date next to this week's pay."
            actions={
              <Button type="button" variant="outline" className="h-8 px-3" onClick={() => openBill()}>
                Add bill
              </Button>
            }
          />
        )}
      </Section>
    </div>
  )
}
