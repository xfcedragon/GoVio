"use client"

import { useState } from "react"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { SegmentedControl } from "@/components/segmented-control"
import { ShiftsTable } from "@/components/shifts-table"
import { FigureRow } from "@/components/stat-card"
import { Button } from "@/components/ui/button"
import { formatCad, formatHours, formatKm } from "@/lib/format"
import { compareShiftsDesc, summarizeShifts } from "@/lib/metrics"
import { useSkipPilot } from "@/lib/store"

export function ShiftsView() {
  const { metrics, data, openShift } = useSkipPilot()
  const [scope, setScope] = useState<"week" | "all">("all")

  const filtered = data.shifts
    .filter((shift) => {
      if (scope === "all") return true
      if (!metrics) return false
      return shift.date >= metrics.weekStartIso && shift.date <= metrics.weekEndIso
    })
    .sort(compareShiftsDesc)
  const summary = summarizeShifts(filtered)
  const weekPending = scope === "week" && metrics === null
  const emptyWeek = scope === "week" && metrics !== null && filtered.length === 0 && data.shifts.length > 0
  const empty = summary.count === 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="Shifts"
        description="Hours come from the clock times, including a finish after midnight."
        actions={
          <Button type="button" className="h-8 px-3" onClick={() => openShift()}>
            Add shift
          </Button>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          label="Shift range"
          value={scope}
          onChange={setScope}
          options={[
            { value: "all", label: "All shifts" },
            { value: "week", label: "This week" },
          ]}
        />
        <p className="text-sm text-muted-foreground">
          {weekPending ? "This week" : empty ? "No shifts in this view" : `${summary.count} in this view`}
        </p>
      </div>

      <section aria-label="Shift totals" className="rounded-md border border-border bg-card px-3 py-3">
        <FigureRow
          columns="grid-cols-3"
          items={[
            {
              label: "Gross",
              value: empty ? "—" : formatCad(summary.earnings),
              tone: empty ? "muted" : summary.earnings > 0 ? "positive" : "default",
              hint: scope === "week" ? "This week" : "All logged shifts",
            },
            {
              label: "Hours",
              value: empty ? "—" : formatHours(summary.hours),
              tone: empty ? "muted" : "default",
              hint: scope === "week" ? "This week" : "All logged shifts",
            },
            {
              label: "Kilometres",
              value: empty ? "—" : formatKm(summary.kilometres),
              tone: empty ? "muted" : "default",
              hint: scope === "week" ? "This week" : "All logged shifts",
            },
          ]}
        />
      </section>

      <section className="overflow-hidden rounded-md border border-border bg-card">
        {filtered.length > 0 ? (
          <ShiftsTable shifts={filtered} />
        ) : (
          <EmptyState
            title={weekPending ? "This week" : emptyWeek ? "No shifts recorded this week." : "No shifts recorded this week."}
            body={
              weekPending
                ? "The week range uses the date on this device."
                : emptyWeek
                  ? "Older shifts are still saved. Switch to all shifts, or add the one you just finished."
                  : "Log a shift when you know the payout. GoVio does not pull numbers from a delivery app."
            }
            actions={
              <>
                <Button type="button" className="h-8 px-3" onClick={() => openShift()}>
                  Add shift
                </Button>
                {emptyWeek ? (
                  <Button type="button" variant="outline" className="h-8 px-3" onClick={() => setScope("all")}>
                    Show all shifts
                  </Button>
                ) : null}
              </>
            }
          />
        )}
      </section>
    </div>
  )
}
