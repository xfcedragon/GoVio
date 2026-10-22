"use client"

import { useState } from "react"
import { Route } from "lucide-react"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { SegmentedControl } from "@/components/segmented-control"
import { ShiftsTable } from "@/components/shifts-table"
import { StatCard } from "@/components/stat-card"
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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Shifts"
        title="Hours, kilometres, and payouts"
        description="Each row is a shift you entered. Hours are counted from the clock times, including a finish after midnight."
        actions={
          <Button type="button" className="h-10 px-3.5" onClick={() => openShift()}>
            Add shift
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          {weekPending
            ? "This week"
            : summary.count === 0
              ? "No shifts in this view"
              : `${summary.count} in this view`}
        </p>
      </div>

      <section aria-label="Shift totals" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Payout"
          value={summary.count === 0 ? "—" : formatCad(summary.earnings)}
          tone={summary.earnings > 0 ? "positive" : "default"}
          hint={scope === "week" ? "This week" : "All logged shifts"}
        />
        <StatCard
          label="Hours"
          value={summary.count === 0 ? "—" : formatHours(summary.hours)}
          hint={scope === "week" ? "This week" : "All logged shifts"}
        />
        <StatCard
          label="Kilometres"
          value={summary.count === 0 ? "—" : formatKm(summary.kilometres)}
          hint={scope === "week" ? "This week" : "All logged shifts"}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {filtered.length > 0 ? (
          <ShiftsTable shifts={filtered} />
        ) : (
          <EmptyState
            icon={Route}
            title={weekPending ? "This week" : emptyWeek ? "Nothing logged this week" : "No shifts yet"}
            body={
              weekPending
                ? "The week range uses the date on this device."
                : emptyWeek
                  ? "Older shifts are still saved. Switch to all shifts, or add the one you just finished."
                  : "Log a shift when you know the payout. GoVio does not pull numbers from a delivery app."
            }
            actions={
              <>
                <Button type="button" className="h-10 px-3.5" onClick={() => openShift()}>
                  Add shift
                </Button>
                {emptyWeek ? (
                  <Button type="button" variant="outline" className="h-10 px-3.5" onClick={() => setScope("all")}>
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
