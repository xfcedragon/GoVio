"use client"

import Link from "next/link"
import { textLinkClass } from "@/components/field"
import { Numeric } from "@/components/numeric"
import { formatCad } from "@/lib/format"
import { useSkipPilot } from "@/lib/store"
import { cn } from "@/lib/utils"

export function WeeklyTargetCard({ className }: { className?: string }) {
  const { metrics, data } = useSkipPilot()
  const target = metrics?.target ?? data.settings.weeklyIncomeTarget
  const week = metrics?.week
  const weekProgress = metrics?.weekProgress ?? null
  const percent = weekProgress === null ? 0 : Math.min(100, Math.round(weekProgress * 100))
  const showProgress = week !== undefined && target > 0 && weekProgress !== null
  const remaining = week ? target - week.earnings : 0

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Weekly goal</p>
        <Link href="/bills#weekly-target" className={cn("text-xs", textLinkClass)}>
          {target > 0 ? "Edit target" : "Set a target"}
        </Link>
      </div>
      {showProgress && week ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            <Numeric tone={week.earnings > 0 ? "positive" : "default"}>{formatCad(week.earnings)}</Numeric>
            <span> of </span>
            <Numeric>{formatCad(target)}</Numeric>
            <span> · {percent}%</span>
          </p>
          <div
            className="mt-2 h-1 overflow-hidden bg-white/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={Math.min(week.earnings, target)}
            aria-label="Weekly income target"
          >
            <div className="h-full bg-foreground/80" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1.5 text-xs leading-4 text-muted-foreground">
            {remaining > 0
              ? `${formatCad(remaining)} still to reach the target. Fuel is not part of this bar.`
              : `Target met by ${formatCad(Math.abs(remaining))}. Fuel is tracked separately.`}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm leading-5 text-muted-foreground">
          {target > 0 && !metrics
            ? "This week's bar uses the date on this device. The target amount is already saved."
            : "No weekly target yet. Set a gross payout target and this bar fills from logged shifts."}
        </p>
      )}
    </div>
  )
}
