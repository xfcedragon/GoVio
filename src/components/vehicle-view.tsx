"use client"

import { useState } from "react"
import { FileDown, Pencil, Plus, Printer, Trash2 } from "lucide-react"
import { EmptyState } from "@/components/empty-state"
import { controlClass, textLinkClass } from "@/components/field"
import { Numeric } from "@/components/numeric"
import { PageHeader } from "@/components/page-header"
import { FigureRow } from "@/components/stat-card"
import { Button } from "@/components/ui/button"
import { ExpenseDialog, MileageDialog, VehicleDialog } from "@/components/vehicle-dialogs"
import { formatISODate, formatWeekdayDate } from "@/lib/dates"
import { formatCad, formatKm, formatLitres } from "@/lib/format"
import { deleteReceiptImage, getReceiptImage } from "@/lib/receipts-db"
import { useSkipPilot } from "@/lib/store"
import {
  CLAIM_STATUSES,
  TRIP_PURPOSES,
  type ClaimStatus,
  type MileageEntry,
  type Vehicle,
  type VehicleExpense,
} from "@/lib/types"
import {
  annualRecordsCsv,
  buildAnnualSummary,
  categoryLabel,
  currentOdometer,
  inCalendarYear,
  vehicleLabel,
  type AnnualSummary,
  type DistanceSource,
} from "@/lib/vehicle"

const DISCLAIMER =
  "This is a recordkeeping report for you and your tax professional. It is not an official T4, not a CRA-approved return, and not a guarantee that any amount is deductible. Amounts marked claimed are your classifications, not a determination by the CRA."

function purposeLabel(id: string): string {
  return TRIP_PURPOSES.find((item) => item.id === id)?.label ?? id
}

function claimLabel(id: string): string {
  return CLAIM_STATUSES.find((item) => item.id === id)?.label ?? id
}

function distanceLabel(source: DistanceSource): string {
  if (source === "odometer") return "Recorded · odometer"
  if (source === "entered") return "Recorded · typed"
  return "Missing"
}

function collectYears(dates: string[], clockYear: number | null): number[] {
  const found = new Set<number>()
  for (const date of dates) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) found.add(Number(date.slice(0, 4)))
  }
  if (clockYear !== null) found.add(clockYear)
  return [...found].sort((a, b) => b - a)
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function PhotoButton({ id, name }: { id: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)

  async function openPhoto() {
    const image = await getReceiptImage(id)
    if (!image) {
      setMissing(true)
      return
    }
    const next = URL.createObjectURL(image.blob)
    setUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return next
    })
  }

  if (missing) return <span className="text-xs text-warning">Photo not in this browser</span>
  return (
    <span className="inline-flex flex-col gap-2">
      <button type="button" className={`text-left ${textLinkClass}`} onClick={() => void openPhoto()}>
        {name || id}
      </button>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className={`text-xs ${textLinkClass}`}>
          Open stored photo
        </a>
      ) : null}
    </span>
  )
}

export function VehicleView() {
  const {
    data,
    now,
    notify,
    saveVehicle,
    deleteVehicle,
    saveMileage,
    deleteMileage,
    saveExpense,
    deleteExpense,
    setFuelClaimStatus,
    setYearCoverage,
  } = useSkipPilot()
  const [pickedYear, setPickedYear] = useState<number | null>(null)
  const [pickedVehicle, setPickedVehicle] = useState<string>("all")
  const [query, setQuery] = useState("")
  const [vehicleEditor, setVehicleEditor] = useState<Vehicle | null | "closed">("closed")
  const [mileageEditor, setMileageEditor] = useState<MileageEntry | null | "closed">("closed")
  const [expenseEditor, setExpenseEditor] = useState<VehicleExpense | null | "closed">("closed")
  const [pendingDelete, setPendingDelete] = useState<
    | { type: "vehicle"; id: string }
    | { type: "mileage"; id: string }
    | { type: "expense"; expense: VehicleExpense }
    | null
  >(null)

  const dates = [
    ...data.shifts.map((shift) => shift.date),
    ...data.mileage.map((entry) => entry.date),
    ...data.expenses.map((expense) => expense.date),
    ...data.fuel.map((fill) => fill.date),
    ...data.odometerReadings.map((reading) => reading.date),
  ]
  const years = collectYears(dates, now ? now.getFullYear() : null)
  const year = pickedYear ?? now?.getFullYear() ?? years[0] ?? null
  // One vehicle still shows every record, including shifts saved before a vehicle existed.
  // A chosen vehicle, when there are several, limits the year to that id.
  const vehicleFilter = data.vehicles.length > 1 && pickedVehicle !== "all" ? pickedVehicle : null

  const summary: AnnualSummary | null =
    year === null
      ? null
      : buildAnnualSummary({
          year,
          shifts: data.shifts,
          fuel: data.fuel,
          mileage: data.mileage,
          expenses: data.expenses,
          vehicles: data.vehicles,
          readings: data.odometerReadings,
          yearCoverage: data.yearCoverage,
          settings: data.settings,
          vehicleId: vehicleFilter,
        })

  const today = now ? formatISODate(now) : ""
  const needle = query.trim().toLowerCase()

  const history = (() => {
    if (!summary) return []
    const rows: { id: string; date: string; kind: string; detail: string; km: string; money: string; status: string }[] = []
    for (const trip of summary.trips) {
      rows.push({
        id: trip.id,
        date: trip.date,
        kind: trip.kind === "shift" ? "Shift" : "Mileage",
        detail: [trip.label, trip.description, trip.note, trip.platform].filter(Boolean).join(" · "),
        km: trip.distanceSource === "missing" ? "Missing" : formatKm(trip.recordedKm),
        money: "",
        status: `${purposeLabel(trip.purpose)} · ${distanceLabel(trip.distanceSource)}${trip.included ? "" : " · left out"}`,
      })
    }
    for (const expense of data.expenses) {
      if (!inCalendarYear(expense.date, summary.year)) continue
      if (vehicleFilter && expense.vehicleId !== vehicleFilter) continue
      rows.push({
        id: expense.id,
        date: expense.date,
        kind: "Receipt",
        detail: [expense.merchant, categoryLabel(expense.category), expense.note].filter(Boolean).join(" · "),
        km: "",
        money: formatCad(expense.total),
        status: claimLabel(expense.claimStatus),
      })
    }
    return rows.filter((row) => {
      if (!needle) return true
      return `${row.date} ${row.kind} ${row.detail} ${row.status}`.toLowerCase().includes(needle)
    })
  })()

  async function confirmDelete() {
    if (!pendingDelete) return
    if (pendingDelete.type === "vehicle") deleteVehicle(pendingDelete.id)
    else if (pendingDelete.type === "mileage") deleteMileage(pendingDelete.id)
    else {
      const expense = pendingDelete.expense
      const saved = deleteExpense(expense.id)
      if (saved && expense.imageId && expense.imageSaved) {
        const removed = await deleteReceiptImage(expense.imageId)
        if (!removed) notify("The receipt row was removed. The photo may still be in this browser until you clear site data.")
      }
    }
    setPendingDelete(null)
  }

  const businessUseValue = !summary ? "—" : summary.businessUse.available ? `${summary.businessUse.percentage.toFixed(1)}%` : "Unavailable"

  return (
    <div className="space-y-6">
      <div className="no-print space-y-6">
        <PageHeader
          title="Vehicle"
          description="Kilometres, receipts, and fuel for the calendar year. Records stay in this browser. Receipt photos stay in this browser's IndexedDB. Nothing syncs. Clearing site data deletes both."
          actions={
            <>
              <Button type="button" variant="outline" className="h-8 px-3" onClick={() => setVehicleEditor(null)}>
                <Plus /> Add vehicle
              </Button>
              <Button type="button" variant="outline" className="h-8 px-3" onClick={() => setMileageEditor(null)}>
                <Plus /> Add mileage
              </Button>
              <Button type="button" className="h-8 px-3" onClick={() => setExpenseEditor(null)}>
                <Plus /> Add receipt
              </Button>
            </>
          }
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">Year</span>
            <select
              className={controlClass}
              value={year ?? ""}
              onChange={(event) => setPickedYear(Number(event.target.value))}
              disabled={year === null}
            >
              {year === null ? <option value="">Waiting for this device&apos;s date</option> : null}
              {years.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          {data.vehicles.length > 1 ? (
            <label className="grid gap-1.5 text-sm">
              <span className="text-muted-foreground">Vehicle</span>
              <select className={controlClass} value={pickedVehicle} onChange={(event) => setPickedVehicle(event.target.value)}>
                <option value="all">All vehicles</option>
                {data.vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>{vehicleLabel(vehicle)}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <p className="rounded-md border border-border bg-card px-3 py-2 text-sm leading-5 text-muted-foreground">
          {DISCLAIMER} Claimed totals add only amounts you marked claimed. Unreviewed and not-claimed amounts stay out. Wear estimates and estimated fuel consumed stay out as well.
        </p>

        {summary ? (
          <>
            <section aria-label="Year totals" className="rounded-md border border-border bg-card px-3 py-2">
              <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Year</h2>
              <div className="mt-3">
                <FigureRow
                  columns="grid-cols-2 lg:grid-cols-3"
                  items={[
                    { label: "Kilometres driven", value: formatKm(summary.recordedKilometres), hint: "Recorded trips after overlap checks. Estimated kilometres are not invented." },
                    { label: "Business kilometres", value: formatKm(summary.businessKilometres), hint: "Only trips you marked business, plus the business portion of mixed trips." },
                    { label: "Personal kilometres", value: formatKm(summary.personalKilometres), hint: "Only trips you marked personal. The remainder is not assumed." },
                    {
                      label: "Business-use percentage",
                      value: summary.businessUse.available ? businessUseValue : "Unavailable",
                      tone: summary.businessUse.available ? "default" : "muted",
                      hint: summary.businessUse.available
                        ? summary.businessUse.explanation
                        : "Unavailable until the year has odometer bookends, or you mark a complete classified log.",
                    },
                    {
                      label: "Gross delivery income",
                      value: formatCad(summary.grossDeliveryIncome),
                      tone: summary.grossDeliveryIncome > 0 ? "positive" : "default",
                      hint: "Shift payouts dated in this year. Gross, before expenses.",
                    },
                    { label: "Claimed vehicle amounts", value: formatCad(summary.claimedTotal), hint: "Your claimed classifications only. Not a CRA determination." },
                  ]}
                />
              </div>
              <h2 className="mt-4 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Fuel</h2>
              <div className="mt-3">
                <FigureRow
                  columns="grid-cols-2 lg:grid-cols-4"
                  items={[
                    { label: "Fuel cash", value: formatCad(summary.fuel.cash), hint: "Receipts and fill-ups by purchase date. A linked receipt replaces its fill-up so it is not added twice." },
                    { label: "Litres purchased", value: summary.fuel.litresPurchased > 0 ? formatLitres(summary.fuel.litresPurchased) : "Unavailable", tone: summary.fuel.litresPurchased > 0 ? "default" : "muted", hint: "Litres on those same purchases." },
                    { label: "Est. litres consumed", value: summary.fuel.consumedLitres === null ? "Unavailable" : formatLitres(summary.fuel.consumedLitres), tone: summary.fuel.consumedLitres === null ? "muted" : "default", hint: summary.fuel.consumedLitres === null ? "Needs recorded kilometres and an L/100 km rate." : `Estimate · ${summary.fuel.rateLabel}. Not a receipt.` },
                    { label: "Est. fuel cost consumed", value: summary.fuel.consumedCost === null ? "Unavailable" : formatCad(summary.fuel.consumedCost), tone: summary.fuel.consumedCost === null ? "muted" : "default", hint: "Consumed litres times the pump price. Not subtracted together with fuel cash." },
                  ]}
                />
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">{summary.fuel.note}</p>
            </section>

            <section id="expenses" className="overflow-hidden rounded-md border border-border bg-card">
              <div className="flex items-end justify-between gap-3 border-b border-border px-3 py-2">
                <div>
                  <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Expenses</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Cash is what was recorded. Claimed is only what you marked claimed. Maintenance cash this year: {formatCad(summary.maintenanceCash)}.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <caption className="sr-only">Expenses by category</caption>
                  <thead>
                    <tr className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 text-right font-medium">Cash</th>
                      <th className="px-3 py-2 text-right font-medium">Claimed</th>
                      <th className="px-3 py-2 text-right font-medium">Unreviewed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.expensesByCategory.map((category) => (
                      <tr key={category.id} className="border-t border-border">
                        <td className="px-3 py-2">{category.label}</td>
                        <td className="px-3 py-2 text-right"><Numeric>{formatCad(category.cash)}</Numeric></td>
                        <td className="px-3 py-2 text-right"><Numeric>{formatCad(category.claimed)}</Numeric></td>
                        <td className="px-3 py-2 text-right"><Numeric>{formatCad(category.unreviewed)}</Numeric></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-md border border-border bg-card px-3 py-2">
              <h2 className="text-sm font-medium">Wear and operating cost</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Estimates. They are not included in the claimed total. Wear uses {summary.wear.baseLabel}
                {summary.wear.rate !== null ? ` at ${formatCad(summary.wear.rate)} per km` : ""}.
              </p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Recorded cash</dt>
                  <dd className="mt-1"><Numeric>{formatCad(summary.operating.cash)}</Numeric></dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Estimated wear</dt>
                  <dd className="mt-1"><Numeric>{summary.wear.cost === null ? "—" : formatCad(summary.wear.cost)}</Numeric></dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Cash plus wear</dt>
                  <dd className="mt-1"><Numeric>{summary.operating.total === null ? "—" : formatCad(summary.operating.total)}</Numeric></dd>
                  <p className="mt-1 text-xs text-muted-foreground">A mix of actual cash and an estimate.</p>
                </div>
                <div>
                  <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Estimated cost per km</dt>
                  <dd className="mt-1"><Numeric>{summary.operating.perKm === null ? "—" : `${formatCad(summary.operating.perKm)}/km`}</Numeric></dd>
                  <p className="mt-1 text-xs text-muted-foreground">Divided by {summary.operating.perKmBaseLabel}.</p>
                </div>
              </dl>
            </section>

            {summary.warnings.length > 0 ? (
              <section className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2">
                <h2 className="text-sm font-medium text-warning">Missing records and estimates</h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-warning">
                  {summary.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {summary.unclassifiedKilometres > 0 ? (
              <p className="text-sm text-muted-foreground">
                Unclassified this year: {formatKm(summary.unclassifiedKilometres)}. These kilometres are missing for tax purposes.
              </p>
            ) : null}
          </>
        ) : (
          <section id="expenses" className="rounded-md border border-border bg-card px-3 py-2">
            <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Expenses</h2>
            <p className="mt-2 text-sm text-muted-foreground">The year filter uses the date on this device. Totals appear once that date is available.</p>
          </section>
        )}

        <section className="rounded-md border border-border bg-card">
          <div className="flex items-center justify-between px-3 py-2">
            <h2 className="text-sm font-medium">Vehicles</h2>
          </div>
          {data.vehicles.length === 0 ? (
            <EmptyState
              title="No vehicle yet"
              body="Add the car you deliver in. A second vehicle can come later. Until then, shifts can still be saved without one."
              actions={<Button type="button" onClick={() => setVehicleEditor(null)}>Add vehicle</Button>}
            />
          ) : (
            <ul className="divide-y divide-border">
              {data.vehicles.map((vehicle) => {
                const readings = data.odometerReadings
                  .filter((reading) => reading.vehicleId === vehicle.id)
                  .sort((a, b) => b.date.localeCompare(a.date) || b.kilometres - a.kilometres)
                const current = currentOdometer(data.odometerReadings, vehicle.id)
                const covered = year !== null && data.yearCoverage.some((item) => item.vehicleId === vehicle.id && item.year === year && item.fullYearLogged)
                return (
                  <li key={vehicle.id} className="px-3 py-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{vehicleLabel(vehicle)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {vehicle.fuelType}
                          {vehicle.litresPer100km !== null ? ` · ${vehicle.litresPer100km} L/100 km on this vehicle` : " · using the Settings L/100 km when set"}
                          {current !== null ? ` · current odometer ${current.toLocaleString("en-CA")} km` : " · no odometer reading yet"}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${vehicleLabel(vehicle)}`} onClick={() => setVehicleEditor(vehicle)}>
                          <Pencil />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${vehicleLabel(vehicle)}`} onClick={() => setPendingDelete({ type: "vehicle", id: vehicle.id })}>
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                    {year !== null ? (
                      <label className="mt-3 flex items-start gap-2 text-sm leading-5 text-muted-foreground">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={covered}
                          onChange={(event) => setYearCoverage(vehicle.id, year, event.target.checked)}
                        />
                        I have classified every kilometre this vehicle drove in {year}. Use business plus personal kilometres as the full year when odometer bookends are missing.
                      </label>
                    ) : null}
                    {readings.length > 0 ? (
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        Reading history ({readings.length}), newest first. Saving a new current odometer appends a row.
                        {" "}
                        {readings.slice(0, 4).map((reading) => `${reading.date} · ${reading.kilometres.toLocaleString("en-CA")} km`).join(" · ")}
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section id="mileage" className="overflow-hidden rounded-md border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2">
            <div>
              <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Mileage</h2>
              <p className="mt-1 text-sm text-muted-foreground">Shifts and separate trips. A shift&apos;s kilometres are not business kilometres until you classify them.</p>
            </div>
            <Button type="button" variant="outline" className="h-8 px-3" onClick={() => setMileageEditor(null)}>Add non-shift trip</Button>
          </div>
          {summary && summary.trips.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">Mileage log</caption>
                <thead>
                  <tr className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Trip</th>
                    <th className="px-3 py-2 font-medium">Distance</th>
                    <th className="px-3 py-2 font-medium">Class</th>
                    <th className="px-3 py-2 font-medium">In totals</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.trips.map((trip) => (
                    <tr key={trip.id} className="border-t border-border">
                      <td className="px-3 py-2">{formatWeekdayDate(trip.date)}</td>
                      <td className="px-3 py-2">
                        <p>{trip.kind === "shift" ? "Shift" : "Mileage"} · {trip.label || "—"}</p>
                        {trip.note ? <p className="text-xs text-muted-foreground">{trip.note}</p> : null}
                        {trip.distanceWarning ? <p className="text-xs text-warning">{trip.distanceWarning}</p> : null}
                      </td>
                      <td className="px-3 py-2">
                        <Numeric>{trip.distanceSource === "missing" ? "Missing" : formatKm(trip.recordedKm)}</Numeric>
                        <p className="text-xs text-muted-foreground">{distanceLabel(trip.distanceSource)}</p>
                      </td>
                      <td className="px-3 py-2">{purposeLabel(trip.purpose)}</td>
                      <td className="px-3 py-2">{trip.included ? "Included" : "Left out · overlap"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 pb-5 text-sm text-muted-foreground">No trips in this year yet. Shifts you add elsewhere show up here.</p>
          )}
          {data.mileage.length > 0 ? (
            <ul className="divide-y divide-border border-t border-border">
              {data.mileage.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>
                    {entry.date} · {entry.shiftId ? "Linked to a shift" : "Not a shift"} · {entry.description || "Mileage entry"}
                  </span>
                  <span className="flex gap-1">
                    <Button type="button" variant="ghost" size="icon" aria-label={`Edit mileage ${entry.date}`} onClick={() => setMileageEditor(entry)}>
                      <Pencil />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Delete mileage ${entry.date}`} onClick={() => setPendingDelete({ type: "mileage", id: entry.id })}>
                      <Trash2 />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section id="receipts" className="overflow-hidden rounded-md border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2">
            <div>
              <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Receipts</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Fill-ups from the Fuel page stay there. They count as fuel cash unless a receipt is linked to the same purchase. Photos open only if they were stored in this browser.
              </p>
            </div>
            <Button type="button" variant="outline" className="h-8 px-3" onClick={() => setExpenseEditor(null)}>Add receipt</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">Receipts and fill-ups</caption>
              <thead>
                <tr className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Merchant</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Classification</th>
                  <th className="px-3 py-2 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data.expenses.map((expense) => (
                  <tr key={expense.id} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap">{formatWeekdayDate(expense.date)}</td>
                    <td className="px-3 py-2">{categoryLabel(expense.category)}</td>
                    <td className="px-3 py-2">
                      <p>{expense.merchant || "—"}</p>
                      {expense.imageSaved && expense.imageId ? <PhotoButton id={expense.imageId} name={expense.imageName || expense.id} /> : <p className="text-xs text-muted-foreground">No photo stored</p>}
                      {expense.fuelFillId ? <p className="text-xs text-muted-foreground">Linked to fill-up {expense.fuelFillId}</p> : null}
                    </td>
                    <td className="px-3 py-2 text-right"><Numeric>{formatCad(expense.total)} {expense.currency}</Numeric></td>
                    <td className="px-3 py-2">{claimLabel(expense.claimStatus)}</td>
                    <td className="px-2 py-1 text-right">
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit receipt ${expense.date}`} onClick={() => setExpenseEditor(expense)}>
                        <Pencil />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete receipt ${expense.date}`} onClick={() => setPendingDelete({ type: "expense", expense })}>
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                ))}
                {data.fuel.map((fill) => (
                  <tr key={fill.id} className="border-t border-border">
                    <td className="px-3 py-2 whitespace-nowrap">{formatWeekdayDate(fill.date)}</td>
                    <td className="px-3 py-2">Fuel</td>
                    <td className="px-3 py-2">
                      {fill.station || "—"}
                      <p className="text-xs text-muted-foreground">{formatLitres(fill.litres)} · cash from the Fuel page</p>
                    </td>
                    <td className="px-3 py-2 text-right"><Numeric>{formatCad(fill.total)}</Numeric></td>
                    <td className="px-3 py-2">
                      <select
                        className={controlClass}
                        aria-label={`Classification for fill-up on ${fill.date}`}
                        value={fill.claimStatus ?? "unreviewed"}
                        onChange={(event) => setFuelClaimStatus(fill.id, event.target.value as ClaimStatus)}
                      >
                        {CLAIM_STATUSES.map((item) => (
                          <option key={item.id} value={item.id}>{item.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-md border border-border bg-card">
          <div className="px-3 py-2">
            <h2 className="text-sm font-medium">History</h2>
            <label className="mt-3 grid gap-1.5 text-sm">
              <span className="text-muted-foreground">Search shifts, mileage, and receipts</span>
              <input className={controlClass} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Merchant, area, date, or note" />
            </label>
          </div>
          {history.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <caption className="sr-only">Searchable history</caption>
                <thead>
                  <tr className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Kind</th>
                    <th className="px-3 py-2 font-medium">Detail</th>
                    <th className="px-3 py-2 font-medium">Km</th>
                    <th className="px-3 py-2 font-medium">Money</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={`${row.kind}-${row.id}`} className="border-t border-border">
                      <td className="px-3 py-2">{row.date}</td>
                      <td className="px-3 py-2">{row.kind}</td>
                      <td className="px-3 py-2">
                        <p>{row.detail || "—"}</p>
                        <p className="text-xs text-muted-foreground">{row.status}</p>
                      </td>
                      <td className="px-3 py-2">{row.km || "—"}</td>
                      <td className="px-3 py-2">{row.money || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-3 pb-3 text-sm text-muted-foreground">{needle ? "Nothing matches that search." : "Nothing in this year yet."}</p>
          )}
        </section>
      </div>

      {summary ? (
        <article id="annual-summary" className="space-y-4 rounded-md border border-border bg-card px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">Annual summary · {summary.year}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{DISCLAIMER}</p>
            </div>
            <div className="no-print flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-8 px-3"
                onClick={() => downloadCsv(`govio-${summary.year}-records.csv`, annualRecordsCsv(summary, { expenses: data.expenses, fuel: data.fuel }))}
              >
                <FileDown /> Download CSV
              </Button>
              <Button type="button" className="h-8 px-3" onClick={() => window.print()}>
                <Printer /> Print / Save as PDF
              </Button>
            </div>
          </div>
          <p className="text-sm leading-6">
            Gross delivery income {formatCad(summary.grossDeliveryIncome)}. Recorded kilometres {formatKm(summary.recordedKilometres)}. Business {formatKm(summary.businessKilometres)}. Personal {formatKm(summary.personalKilometres)}. Unclassified {formatKm(summary.unclassifiedKilometres)} (missing for tax, not deducted).
          </p>
          <p className="text-sm leading-6">
            {summary.businessUse.available
              ? `Business-use percentage ${summary.businessUse.percentage.toFixed(1)}% (${formatKm(summary.businessUse.numeratorKm)} / ${formatKm(summary.businessUse.denominatorKm)}). ${summary.businessUse.explanation}`
              : summary.businessUse.reason}
          </p>
          <h3 className="text-sm font-medium">Mileage log</h3>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="py-1 pr-3 font-medium">Date</th>
                <th className="py-1 pr-3 font-medium">Record</th>
                <th className="py-1 pr-3 font-medium">Km</th>
                <th className="py-1 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {summary.trips.map((trip) => (
                <tr key={`print-${trip.id}`} className="border-t border-border">
                  <td className="py-1 pr-3">{trip.date}</td>
                  <td className="py-1 pr-3">{trip.kind} · {purposeLabel(trip.purpose)} · {trip.description || trip.label}{trip.included ? "" : " · left out of totals"}</td>
                  <td className="py-1 pr-3">{trip.distanceSource === "missing" ? "Missing" : formatKm(trip.recordedKm)}</td>
                  <td className="py-1">{distanceLabel(trip.distanceSource)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 className="text-sm font-medium">Expenses by category</h3>
          <ul className="text-sm leading-6">
            {summary.expensesByCategory.map((category) => (
              <li key={`print-${category.id}`}>{category.label}: cash {formatCad(category.cash)}, claimed {formatCad(category.claimed)}, unreviewed {formatCad(category.unreviewed)}</li>
            ))}
          </ul>
          <p className="text-sm">Claimed total {formatCad(summary.claimedTotal)}. This is your classification, not a CRA figure. Maintenance cash {formatCad(summary.maintenanceCash)}.</p>
          <h3 className="text-sm font-medium">Fuel purchases</h3>
          <p className="text-sm leading-6">
            Cash {formatCad(summary.fuel.cash)}. Litres purchased {formatLitres(summary.fuel.litresPurchased)}. Estimated litres consumed {summary.fuel.consumedLitres === null ? "unavailable" : formatLitres(summary.fuel.consumedLitres)}. Estimated cost consumed {summary.fuel.consumedCost === null ? "unavailable" : formatCad(summary.fuel.consumedCost)}. {summary.fuel.note}
          </p>
          <ul className="text-sm leading-6">
            {data.fuel.filter((fill) => inCalendarYear(fill.date, summary.year)).map((fill) => (
              <li key={`fuel-${fill.id}`}>{fill.date} · fill-up {fill.id} · {fill.station || "No station"} · {formatLitres(fill.litres)} · {formatCad(fill.total)} · {claimLabel(fill.claimStatus ?? "unreviewed")}</li>
            ))}
            {data.expenses.filter((expense) => expense.category === "fuel" && inCalendarYear(expense.date, summary.year)).map((expense) => (
              <li key={`fuel-exp-${expense.id}`}>{expense.date} · receipt {expense.id} · {expense.merchant || "No merchant"} · {formatCad(expense.total)} · {claimLabel(expense.claimStatus)}{expense.fuelFillId ? ` · linked to fill-up ${expense.fuelFillId}` : ""}</li>
            ))}
          </ul>
          <h3 className="text-sm font-medium">Receipt index</h3>
          {summary.receiptIndex.length === 0 ? <p className="text-sm">No receipts dated in this year.</p> : (
            <ul className="text-sm leading-6">
              {summary.receiptIndex.map((receipt) => (
                <li key={receipt.id}>
                  {receipt.id} · {receipt.filename || "no filename"} · {receipt.date} · {receipt.merchant || "No merchant"} · {formatCad(receipt.total)} {receipt.currency} · {receipt.imageSaved ? "photo stored in this browser" : "no photo stored"}
                </li>
              ))}
            </ul>
          )}
          <h3 className="text-sm font-medium">Warnings</h3>
          {summary.warnings.length === 0 ? <p className="text-sm">No warnings for this year.</p> : (
            <ul className="list-disc pl-5 text-sm leading-6">
              {summary.warnings.map((warning) => <li key={`warn-${warning}`}>{warning}</li>)}
            </ul>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            Wear estimate {summary.wear.cost === null ? "not calculated" : formatCad(summary.wear.cost)} on {summary.wear.baseLabel}. It is excluded from the claimed total. Photos and the ledger exist only in this browser.
          </p>
        </article>
      ) : (
        <article id="annual-summary" className="rounded-md border border-border bg-card px-3 py-2">
          <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Reports</h2>
          <p className="mt-2 text-sm text-muted-foreground">The year filter uses the date on this device. The annual report appears once that date is available.</p>
        </article>
      )}

      <VehicleDialog
        open={vehicleEditor !== "closed"}
        vehicle={vehicleEditor === "closed" ? null : vehicleEditor}
        today={today}
        onClose={() => setVehicleEditor("closed")}
        onSave={(vehicle, reading) => {
          if (saveVehicle(vehicle, reading)) setVehicleEditor("closed")
        }}
      />
      <MileageDialog
        open={mileageEditor !== "closed"}
        entry={mileageEditor === "closed" ? null : mileageEditor}
        today={today}
        vehicles={data.vehicles}
        shifts={data.shifts}
        mileage={data.mileage}
        onClose={() => setMileageEditor("closed")}
        onSave={(entry) => {
          if (saveMileage(entry)) setMileageEditor("closed")
        }}
      />
      <ExpenseDialog
        open={expenseEditor !== "closed"}
        expense={expenseEditor === "closed" ? null : expenseEditor}
        today={today}
        vehicles={data.vehicles}
        expenses={data.expenses}
        fuel={data.fuel}
        onClose={() => setExpenseEditor("closed")}
        onSave={saveExpense}
        onNotify={notify}
      />

      <div className="no-print">
        {pendingDelete ? (
          <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 px-4">
            <div className="w-full max-w-md rounded-md bg-popover p-4 text-popover-foreground ring-1 ring-border" role="dialog" aria-modal="true" aria-labelledby="delete-title">
              <h2 id="delete-title" className="text-sm font-medium">
                {pendingDelete.type === "vehicle" ? "Remove this vehicle?" : pendingDelete.type === "mileage" ? "Delete this mileage entry?" : "Delete this receipt?"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {pendingDelete.type === "vehicle"
                  ? "The vehicle and its odometer history are removed from this browser. Shifts, mileage, and receipts stay, without that vehicle link."
                  : "This removes the record from this browser. A stored photo is deleted with a receipt when the browser allows it."}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
                <Button type="button" variant="destructive" onClick={() => void confirmDelete()}>Delete</Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
