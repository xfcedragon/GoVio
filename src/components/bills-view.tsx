"use client"

import { useState } from "react"
import { BillList } from "@/components/bill-list"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { WeeklyTargetCard } from "@/components/weekly-target"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { parseDecimal } from "@/lib/parse"
import { useSkipPilot } from "@/lib/store"

function TargetForm({ stored }: { stored: number }) {
  const { updateSettings, notify } = useSkipPilot()
  const [target, setTarget] = useState(stored > 0 ? stored.toFixed(2) : "")
  const [error, setError] = useState("")
  const dirty = (stored > 0 ? stored.toFixed(2) : "") !== target

  function saveTarget(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = target.trim()
    if (!trimmed) {
      if (updateSettings({ weeklyIncomeTarget: 0 })) notify("Weekly target cleared")
      return
    }
    const value = parseDecimal(trimmed, 2)
    if (value === null || value <= 0) {
      setError("Enter a target above zero, or leave it blank to clear it.")
      return
    }
    if (value > 100_000) {
      setError("Use a target for one week, not a year.")
      return
    }
    setError("")
    if (updateSettings({ weeklyIncomeTarget: value })) notify("Weekly target saved")
  }

  return (
    <form
      id="weekly-target"
      onSubmit={saveTarget}
      className="rounded-md border border-border bg-card p-3 lg:col-span-2"
    >
      <h2 className="text-base font-semibold">Weekly income target</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        Gross pay you want from shifts this week. Leave blank to clear it.
      </p>
      <label htmlFor="weekly-target-amount" className="mt-4 block text-sm font-medium">
        Target (CAD)
      </label>
      <Input
        id="weekly-target-amount"
        className="mt-1.5 h-10"
        inputMode="decimal"
        value={target}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "weekly-target-error" : undefined}
        onChange={(event) => setTarget(event.target.value)}
        placeholder="500.00"
      />
      {error ? (
        <p id="weekly-target-error" className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="mt-4 h-8 px-3" disabled={!dirty && !error}>
        Save target
      </Button>
    </form>
  )
}

export function BillsView() {
  const { metrics, data, openBill } = useSkipPilot()

  const upcoming = data.bills
    .filter((bill) => !bill.paid)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name))
  const paid = data.bills
    .filter((bill) => bill.paid)
    .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bills"
        description="The weekly target is gross pay before fuel. Bills are reminders you type in. Nothing is fetched from a bank."
        actions={
          <Button type="button" className="h-8 px-3" onClick={() => openBill()}>
            Add bill
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <TargetForm key={data.settings.weeklyIncomeTarget} stored={data.settings.weeklyIncomeTarget} />
        <WeeklyTargetCard className="rounded-md border border-border bg-card px-3 py-3 lg:col-span-3" />
      </div>

      <section className="overflow-hidden rounded-md border border-border bg-card">
        <div className="border-b border-border px-3 py-2">
          <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Upcoming</h2>
        </div>
        {upcoming.length > 0 ? (
          <BillList bills={upcoming} todayIso={metrics?.todayIso ?? null} />
        ) : (
          <EmptyState
            title="No unpaid bills"
            body="Add a bill with a due date. Overdue ones stay in this list until you mark them paid or delete them."
            actions={
              <Button type="button" className="h-8 px-3" onClick={() => openBill()}>
                Add bill
              </Button>
            }
          />
        )}
      </section>

      {paid.length > 0 ? (
        <section className="overflow-hidden rounded-md border border-border bg-card">
          <div className="border-b border-border px-3 py-2">
            <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Paid</h2>
          </div>
          <BillList bills={paid} todayIso={metrics?.todayIso ?? null} />
        </section>
      ) : null}
    </div>
  )
}
