"use client"

import { Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Numeric } from "@/components/numeric"
import { duePhrase, formatMonthDay } from "@/lib/dates"
import { formatCad } from "@/lib/format"
import { useSkipPilot } from "@/lib/store"
import { BILL_CATEGORIES, type Bill } from "@/lib/types"

function categoryLabel(category: Bill["category"]) {
  return BILL_CATEGORIES.find((item) => item.id === category)?.label ?? "Other"
}

export function BillList({
  bills,
  todayIso,
  compact = false,
}: {
  bills: Bill[]
  todayIso: string | null
  compact?: boolean
}) {
  const { openBill, requestDeleteBill, toggleBillPaid } = useSkipPilot()

  return (
    <ul className="divide-y divide-border">
      {bills.map((bill) => {
        const phrase = todayIso ? duePhrase(bill.dueDate, todayIso) : `Due ${formatMonthDay(bill.dueDate)}`
        const overdue = todayIso !== null && !bill.paid && bill.dueDate < todayIso
        return (
          <li key={bill.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{bill.name}</p>
              <p className={`mt-0.5 text-xs ${overdue ? "text-warning" : "text-muted-foreground"}`}>
                {categoryLabel(bill.category)} · {bill.paid ? "Paid" : phrase}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Numeric className="mr-1 text-sm">{formatCad(bill.amount)}</Numeric>
              {compact ? null : (
                <Button type="button" variant="ghost" size="sm" onClick={() => toggleBillPaid(bill.id)}>
                  {bill.paid ? "Mark unpaid" : "Mark paid"}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Edit ${bill.name}`}
                onClick={() => openBill(bill)}
              >
                <Pencil />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Delete ${bill.name}`}
                onClick={() => requestDeleteBill(bill.id)}
              >
                <Trash2 />
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
