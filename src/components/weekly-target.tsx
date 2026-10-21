"use client"

import Link from "next/link"
import { Numeric } from "@/components/numeric"
import { formatCad } from "@/lib/format"
import { useSkipPilot } from "@/lib/store"
import { cn } from "@/lib/utils"

export function WeeklyTargetCard({ className }: { className?: string }) {
  const { metrics } = useSkipPilot()
  if (!metrics) return null
  const { week, target, weekProgress } = metrics
  const percent = weekProgress === null ? 0 : Math.min(100, Math.round(weekProgress * 100))
  const remaining = target - week.earnings

  return (
    <article className={cn("rounded-2xl border border-border bg-card px-4 py-4 sm:px-5 sm:py-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Weekly income target
          </p>
          <h2 className="mt-2 text-base font-semibold text-foreground">Gross pay this week</h2>
        </div>
        <Link href="/bills#weekly-target" className="text-sm text-primary hover:underline">
          {target > 0 ? "Edit target" : "Set a target"}
        </Link>
      </div>
      {target > 0 && weekProgress !== null ? (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            <Numeric tone="positive">{formatCad(week.earnings)}</Numeric>
            <span> of </span>
            <Numeric>{formatCad(target)}</Numeric>
            <span> · {percent}%</span>
          </p>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={Math.min(week.earnings, target)}
            aria-label="Weekly income target"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {remaining > 0
              ? `${formatCad(remaining)} still to reach the target. Fuel is not part of this bar.`
              : `Target met by ${formatCad(Math.abs(remaining))}. Fuel is tracked separately.`}
          </p>
        </>
      ) : (
        <p className="mt-4 max-w-prose text-sm leading-6 text-muted-foreground">
          No weekly target yet. Set the amount you want in gross payouts and this bar fills from the shifts you log.
        </p>
      )}
    </article>
  )
}
