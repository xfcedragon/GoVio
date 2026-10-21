"use client"

import { Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Numeric } from "@/components/numeric"
import { formatTime, formatWeekdayDate } from "@/lib/dates"
import { formatCad, formatHours, formatKm } from "@/lib/format"
import { shiftHours } from "@/lib/metrics"
import { useSkipPilot } from "@/lib/store"
import type { Shift } from "@/lib/types"

export function ShiftsTable({
  shifts,
  compact = false,
}: {
  shifts: Shift[]
  compact?: boolean
}) {
  const { openShift, requestDeleteShift } = useSkipPilot()

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <caption className="sr-only">Shifts you have logged</caption>
        <thead>
          <tr className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            <th className="px-5 py-3 font-medium">Date</th>
            <th className="px-3 py-3 font-medium">Clock</th>
            <th className="px-3 py-3 font-medium">Hours</th>
            <th className="px-3 py-3 font-medium">Distance</th>
            {compact ? null : <th className="px-3 py-3 font-medium">Orders</th>}
            <th className="px-3 py-3 font-medium">Payout</th>
            <th className="px-5 py-3 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shifts.map((shift) => (
            <tr key={shift.id} className="border-t border-border transition-colors hover:bg-white/[0.03]">
              <td className="px-5 py-3 align-top">
                <div className="font-medium text-foreground">{formatWeekdayDate(shift.date)}</div>
                {shift.area ? (
                  <div className="mt-0.5 text-xs text-muted-foreground">{shift.area}</div>
                ) : null}
                {!compact && shift.note ? (
                  <div className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">{shift.note}</div>
                ) : null}
              </td>
              <td className="px-3 py-3 align-top whitespace-nowrap text-muted-foreground">
                {formatTime(shift.start)} – {formatTime(shift.end)}
              </td>
              <td className="px-3 py-3 align-top whitespace-nowrap">
                <Numeric>{formatHours(shiftHours(shift.start, shift.end))}</Numeric>
              </td>
              <td className="px-3 py-3 align-top whitespace-nowrap">
                <Numeric>{formatKm(shift.kilometres)}</Numeric>
              </td>
              {compact ? null : (
                <td className="px-3 py-3 align-top">
                  <Numeric>{shift.orders === null ? "—" : String(shift.orders)}</Numeric>
                </td>
              )}
              <td className="px-3 py-3 align-top whitespace-nowrap">
                <Numeric tone="positive">{formatCad(shift.earnings)}</Numeric>
              </td>
              <td className="px-4 py-2 text-right align-top">
                <div className="flex justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit shift on ${formatWeekdayDate(shift.date)}`}
                    onClick={() => openShift(shift)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete shift on ${formatWeekdayDate(shift.date)}`}
                    onClick={() => requestDeleteShift(shift.id)}
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
