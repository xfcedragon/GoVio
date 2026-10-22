"use client"

import { useMemo, useState } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Numeric } from "@/components/numeric"
import { formatTime, formatWeekdayDate, isClock } from "@/lib/dates"
import { formatCad, formatHours, formatKm, roundMoney } from "@/lib/format"
import { compareShiftsDesc, distanceFuelEstimate, shiftHours } from "@/lib/metrics"
import { usableShiftHours } from "@/lib/hourly"
import { useSkipPilot } from "@/lib/store"
import type { Shift } from "@/lib/types"
import { platformOf } from "@/lib/vehicle"

type SortKey = "date" | "platform" | "hours" | "gross" | "rate" | "expense" | "net"
type SortDir = "asc" | "desc"

function perHour(value: number | null): string {
  if (value === null) return "Unavailable"
  return `${formatCad(value)}/h`
}

function compareNullable(a: number | null, b: number | null, dir: number): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return (a - b) * dir
}

export function ShiftsTable({
  shifts,
  compact = false,
}: {
  shifts: Shift[]
  compact?: boolean
}) {
  const { openShift, requestDeleteShift, data } = useSkipPilot()
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "date", dir: "desc" })

  const rows = useMemo(() => {
    const next = shifts.map((shift) => {
      const clocked =
        isClock(shift.start) && isClock(shift.end) ? shiftHours(shift.start, shift.end) : null
      const hours = usableShiftHours(shift.start, shift.end)
      const expense = distanceFuelEstimate(shift.kilometres, data.settings)
      const grossHourly = hours ? roundMoney(shift.earnings / hours) : null
      const netHourly =
        hours && expense !== null ? roundMoney((shift.earnings - expense) / hours) : null
      return {
        shift,
        clocked,
        hours,
        expense,
        grossHourly,
        netHourly,
        platform: platformOf(shift),
      }
    })
    const dir = sort.dir === "asc" ? 1 : -1
    next.sort((a, b) => {
      if (sort.key === "date") {
        return compareShiftsDesc(a.shift, b.shift) * (sort.dir === "desc" ? 1 : -1)
      }
      if (sort.key === "platform") return a.platform.localeCompare(b.platform, "en-CA") * dir
      if (sort.key === "hours") return compareNullable(a.clocked, b.clocked, dir)
      if (sort.key === "gross") return (a.shift.earnings - b.shift.earnings) * dir
      if (sort.key === "rate") return compareNullable(a.grossHourly, b.grossHourly, dir)
      if (sort.key === "expense") return compareNullable(a.expense, b.expense, dir)
      return compareNullable(a.netHourly, b.netHourly, dir)
    })
    return next
  }, [data.settings, shifts, sort.dir, sort.key])

  function toggle(key: SortKey) {
    setSort((current) => {
      if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" }
      return { key, dir: key === "platform" ? "asc" : "desc" }
    })
  }

  function header(key: SortKey, label: string, align: "left" | "right" = "left") {
    const active = sort.key === key
    return (
      <th aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={align === "right" ? "px-3 py-2 text-right font-medium" : "px-3 py-2 text-left font-medium"}>
        <button
          type="button"
          onClick={() => toggle(key)}
          className={`inline-flex items-center gap-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground ${align === "right" ? "justify-end" : ""}`}
        >
          {label}
          {active ? <span aria-hidden="true">{sort.dir === "asc" ? "↑" : "↓"}</span> : null}
        </button>
      </th>
    )
  }

  return (
    <div className="overflow-x-auto">
      {compact ? null : (
        <p className="border-b border-border px-3 py-1.5 text-[11px] leading-4 text-muted-foreground">
          Est. fuel is kilometres × L/100 km × pump price for that shift. It is not a fill-up. Unavailable means the figure cannot be priced.
        </p>
      )}
      <table className="w-full min-w-[920px] text-left text-sm">
        <caption className="sr-only">Shifts you have logged</caption>
        <thead>
          <tr className="border-b border-border">
            {header("date", "Date")}
            {header("platform", "Platform")}
            {header("hours", "Hours", "right")}
            {header("gross", "Gross", "right")}
            {header("rate", "Gross/hr", "right")}
            {header("expense", "Est. fuel", "right")}
            {header("net", "Est. net/hr", "right")}
            <th className="px-3 py-2 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { shift } = row
            const rateTone = row.grossHourly === null ? "muted" : row.grossHourly > 0 ? "positive" : "default"
            const netTone =
              row.netHourly === null ? "muted" : row.netHourly < 0 ? "warning" : row.netHourly > 0 ? "positive" : "default"
            return (
              <tr key={shift.id} className="border-t border-border hover:bg-white/[0.03]">
                <td className="px-3 py-2 align-top">
                  <div className="font-medium text-foreground">{formatWeekdayDate(shift.date)}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {formatTime(shift.start)} – {formatTime(shift.end)}
                  </div>
                  {!compact && shift.note ? (
                    <div className="mt-1 max-w-xs text-xs leading-4 text-muted-foreground">{shift.note}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2 align-top">
                  <div>{row.platform}</div>
                  {shift.area ? <div className="mt-0.5 text-xs text-muted-foreground">{shift.area}</div> : null}
                </td>
                <td className="px-3 py-2 text-right align-top whitespace-nowrap">
                  <Numeric tone={row.clocked === null ? "muted" : "default"}>
                    {row.clocked === null ? "Unavailable" : formatHours(row.clocked)}
                  </Numeric>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {formatKm(shift.kilometres)}
                    {shift.orders === null ? "" : ` · ${shift.orders}`}
                  </div>
                </td>
                <td className="px-3 py-2 text-right align-top whitespace-nowrap">
                  <Numeric tone={shift.earnings > 0 ? "positive" : "default"}>{formatCad(shift.earnings)}</Numeric>
                </td>
                <td className="px-3 py-2 text-right align-top whitespace-nowrap">
                  <Numeric tone={rateTone}>{perHour(row.grossHourly)}</Numeric>
                </td>
                <td
                  className="px-3 py-2 text-right align-top whitespace-nowrap"
                  title={
                    row.expense === null
                      ? "Estimate unavailable until this shift has kilometres and vehicle rates are saved"
                      : "Estimate · kilometres × L/100 km × pump price"
                  }
                >
                  <Numeric tone={row.expense === null ? "muted" : "default"}>
                    {row.expense === null ? "Unavailable" : formatCad(row.expense)}
                  </Numeric>
                </td>
                <td
                  className="px-3 py-2 text-right align-top whitespace-nowrap"
                  title={
                    row.netHourly === null
                      ? "Estimated net per hour needs usable hours and an estimated fuel cost"
                      : "Estimate · payout minus estimated fuel, divided by hours"
                  }
                >
                  <Numeric tone={netTone}>{perHour(row.netHourly)}</Numeric>
                </td>
                <td className="px-2 py-1 text-right align-top">
                  <div className="flex justify-end gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit shift on ${formatWeekdayDate(shift.date)}`}
                      onClick={() => openShift(shift)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete shift on ${formatWeekdayDate(shift.date)}`}
                      onClick={() => requestDeleteShift(shift.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
