"use client"

import Link from "next/link"
import { Receipt, Route } from "lucide-react"
import { BillList } from "@/components/bill-list"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { ShiftsTable } from "@/components/shifts-table"
import { Skeleton } from "@/components/skeleton"
import { StatCard } from "@/components/stat-card"
import { WeeklyTargetCard } from "@/components/weekly-target"
import { formatLongDate, formatMonthDay, greetingFor } from "@/lib/dates"
import { countLabel, formatCad, formatHours, formatKm } from "@/lib/format"
import { compareShiftsDesc, fuelMethodLabel } from "@/lib/metrics"
import { PROVINCES } from "@/lib/types"
import { useSkipPilot } from "@/lib/store"
import { cn } from "@/lib/utils"

function moneyValue(active: boolean, value: number) {
  return active ? formatCad(value) : "—"
}

export function Overview() {
  const { ready, now, data, metrics, demo, openShift, openFuel, openBill, requestSample } = useSkipPilot()

  if (!ready || !now || !metrics) {
    return (
      <div aria-busy="true">
        <p className="sr-only">Loading your ledger</p>
        <div className="space-y-3">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-32 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  const province = PROVINCES.find((item) => item.code === data.settings.province)?.name
  const recent = [...data.shifts].sort(compareShiftsDesc).slice(0, 5)
  const upcoming = data.bills
    .filter((bill) => !bill.paid)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name))
    .slice(0, 4)
  const { today, week, allTime, hasShifts } = metrics
  const netTone = week.net !== null && week.net < 0 ? "warning" : week.net !== null ? "positive" : "default"

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{formatLongDate(now)}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
            {greetingFor(now, data.settings.displayName)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Week of {formatMonthDay(metrics.weekStartIso)} – {formatMonthDay(metrics.weekEndIso)}
            {" · "}
            {province ? `${province} · ` : ""}
            Canadian dollars
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-10 px-3.5" onClick={() => openFuel()}>
            Log fill-up
          </Button>
          <Button type="button" className="h-10 px-3.5" onClick={() => openShift()}>
            Add shift
          </Button>
        </div>
      </div>

      {!hasShifts && data.fuel.length === 0 && data.bills.length === 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">
          Nothing is stored yet. Add a shift after you cash out, or preview a labeled sample week to see the layout.
        </p>
      ) : null}

      <section aria-label="Earnings summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's earnings"
          value={moneyValue(hasShifts, today.earnings)}
          tone={hasShifts && today.earnings > 0 ? "positive" : "default"}
          hint={
            !hasShifts
              ? "Nothing logged yet"
              : today.shiftCount === 0
                ? "No shift logged today"
                : `${countLabel(today.shiftCount, "shift")} · ${formatHours(today.hours)} · ${formatKm(today.kilometres)}`
          }
        />
        <StatCard
          label="This week's earnings"
          value={moneyValue(hasShifts, week.earnings)}
          tone={hasShifts && week.earnings > 0 ? "positive" : "default"}
          hint={hasShifts ? `${countLabel(week.shiftCount, "shift")} this week` : "Nothing logged yet"}
        />
        <StatCard
          label="Estimated fuel"
          value={week.fuelMethod === "none" ? "—" : formatCad(week.fuelCost)}
          hint={
            week.fuelMethod === "none"
              ? "Log a fill-up, or set L/100 km and a pump price"
              : fuelMethodLabel(week.fuelMethod)
          }
        />
        <StatCard
          className="sm:col-span-2 xl:col-span-1"
          featured
          label="After fuel"
          value={week.net === null ? "—" : formatCad(week.net)}
          tone={netTone}
          hint={
            week.net === null
              ? "Fuel is not subtracted yet"
              : week.net < 0
                ? "Fuel is higher than this week's pay"
                : "This week's pay minus fuel"
          }
        />
        <StatCard
          label="Hours driven"
          value={hasShifts ? formatHours(week.hours) : "—"}
          hint={
            hasShifts && allTime.hours !== week.hours
              ? `This week · ${formatHours(allTime.hours)} all time`
              : "This week"
          }
        />
        <StatCard
          label="Kilometres driven"
          value={hasShifts ? formatKm(week.kilometres) : "—"}
          hint={
            hasShifts && allTime.kilometres !== week.kilometres
              ? `This week · ${formatKm(allTime.kilometres)} all time`
              : "This week"
          }
        />
        <WeeklyTargetCard className="sm:col-span-2" />
      </section>

      <div className="grid gap-4 xl:grid-cols-12">
        <section className={cn("overflow-hidden rounded-2xl border border-border bg-card xl:col-span-7")}>
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <h2 className="text-base font-semibold">Recent shifts</h2>
            {data.shifts.length > 0 ? (
              <Link href="/shifts" className="text-sm text-primary hover:underline">
                All shifts
              </Link>
            ) : null}
          </div>
          {recent.length > 0 ? (
            <ShiftsTable shifts={recent} compact />
          ) : (
            <EmptyState
              icon={Route}
              title="No shifts yet"
              body="Add a shift with the payout, clock times, and kilometres. Today and this week update from what you enter."
              actions={
                <>
                  <Button type="button" className="h-10 px-3.5" onClick={() => openShift()}>
                    Add shift
                  </Button>
                  {demo ? null : (
                    <Button type="button" variant="outline" className="h-10 px-3.5" onClick={requestSample}>
                      Preview sample week
                    </Button>
                  )}
                </>
              }
            />
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-border bg-card xl:col-span-5">
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <h2 className="text-base font-semibold">Upcoming bills</h2>
            {data.bills.some((bill) => !bill.paid) ? (
              <Link href="/bills" className="text-sm text-primary hover:underline">
                All bills
              </Link>
            ) : null}
          </div>
          {upcoming.length > 0 ? (
            <>
              <BillList bills={upcoming} todayIso={metrics.todayIso} compact />
              <div className="border-t border-border px-5 py-3">
                <Button type="button" variant="outline" className="h-9" onClick={() => openBill()}>
                  Add bill
                </Button>
              </div>
            </>
          ) : (
            <EmptyState
              icon={Receipt}
              title="No upcoming bills"
              body="Add rent, insurance, or a phone bill if you want the due date next to this week's pay."
              actions={
                <Button type="button" variant="outline" className="h-10 px-3.5" onClick={() => openBill()}>
                  Add bill
                </Button>
              }
            />
          )}
        </section>
      </div>
    </div>
  )
}
