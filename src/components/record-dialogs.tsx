"use client"

import { useState } from "react"
import { controlClass, Field } from "@/components/field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { formatISODate, formatWeekdayDate, isClock, isISODate } from "@/lib/dates"
import { formatCad, formatHours } from "@/lib/format"
import { shiftHours } from "@/lib/metrics"
import { parseDecimal, parseOptionalInteger } from "@/lib/parse"
import { useSkipPilot } from "@/lib/store"
import { BILL_CATEGORIES, DEFAULT_PLATFORM, TRIP_PURPOSES, type Bill, type BillCategory, type FuelFill, type Shift, type TripPurpose } from "@/lib/types"
import { findOverlaps, resolveTripKilometres, type SpanRecord } from "@/lib/vehicle"

function newId() {
  return crypto.randomUUID()
}

function decimalInput(value: number) {
  return String(Math.round(value * 1000) / 1000)
}

function SampleNotice({ demo }: { demo: boolean }) {
  if (!demo) return null
  return (
    <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
      Sample week is on. This entry stays with the sample until you clear it.
    </p>
  )
}

function ShiftForm({
  existing,
  today,
  demo,
  onCancel,
  onSave,
}: {
  existing: Shift | null
  today: string
  demo: boolean
  onCancel: () => void
  onSave: (shift: Shift) => void
}) {
  const { data } = useSkipPilot()
  const onlyVehicle = data.vehicles.length === 1 ? data.vehicles[0] : null
  const [date, setDate] = useState(existing?.date ?? today)
  const [start, setStart] = useState(existing?.start ?? "")
  const [end, setEnd] = useState(existing?.end ?? "")
  const [earnings, setEarnings] = useState(existing ? existing.earnings.toFixed(2) : "")
  const [kilometres, setKilometres] = useState(existing ? String(existing.kilometres) : "")
  const [orders, setOrders] = useState(existing?.orders === null || !existing ? "" : String(existing.orders))
  const [area, setArea] = useState(existing?.area ?? "")
  const [note, setNote] = useState(existing?.note ?? "")
  const [platform, setPlatform] = useState(existing?.platform?.trim() || data.settings.defaultPlatform || DEFAULT_PLATFORM)
  const [purpose, setPurpose] = useState<TripPurpose>(existing?.purpose ?? "unclassified")
  const [businessKm, setBusinessKm] = useState(
    existing?.businessKilometres === null || existing?.businessKilometres === undefined ? "" : String(existing.businessKilometres),
  )
  const [businessPurpose, setBusinessPurpose] = useState(existing?.businessPurpose ?? "")
  const [startOdometer, setStartOdometer] = useState(
    existing?.startOdometer === null || existing?.startOdometer === undefined ? "" : String(existing.startOdometer),
  )
  const [endOdometer, setEndOdometer] = useState(
    existing?.endOdometer === null || existing?.endOdometer === undefined ? "" : String(existing.endOdometer),
  )
  const [vehicleId, setVehicleId] = useState(existing?.vehicleId ?? onlyVehicle?.id ?? "")
  const [evidenceId, setEvidenceId] = useState(existing?.evidenceId ?? "")
  const [distanceAck, setDistanceAck] = useState(false)
  const [overlapAck, setOverlapAck] = useState(existing?.overlapAcknowledged ?? false)
  const [logOpen, setLogOpen] = useState(
    Boolean(existing?.startOdometer || existing?.endOdometer || (existing?.purpose && existing.purpose !== "unclassified")),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const hoursPreview = isClock(start) && isClock(end) ? formatHours(shiftHours(start, end)) : null
  const linkedVehicle = vehicleId || onlyVehicle?.id || null

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!isISODate(date)) next.date = "Choose the date you drove."
    if (!isClock(start)) next.start = "Enter the start time."
    if (!isClock(end)) next.end = "Enter the end time."
    const payout = parseDecimal(earnings, 2)
    if (payout === null) next.earnings = "Enter the payout in dollars. Use 0 if it paid nothing."
    else if (payout > 100_000) next.earnings = "That payout is too large for one shift."
    const distance = parseDecimal(kilometres, 1)
    if (distance === null) next.kilometres = "Enter kilometres. Use 0 if you don't have them."
    else if (distance > 2_000) next.kilometres = "Enter the kilometres for this shift only."
    const orderCount = parseOptionalInteger(orders)
    if (orderCount === undefined) next.orders = "Orders should be a whole number, or left blank."
    else if (orderCount !== null && orderCount > 500) next.orders = "Enter the orders for this shift only."
    const startReading = parseOptionalInteger(startOdometer)
    const endReading = parseOptionalInteger(endOdometer)
    if (startReading === undefined) next.startOdometer = "Starting odometer should be a whole number, or left blank."
    if (endReading === undefined) next.endOdometer = "Ending odometer should be a whole number, or left blank."
    let kilometresToSave = distance
    if (startReading !== undefined && endReading !== undefined && startReading !== null && endReading !== null && distance !== null) {
      const resolved = resolveTripKilometres({
        startOdometer: startReading,
        endOdometer: endReading,
        enteredKilometres: distance,
      })
      if (resolved.rejected) next.odometer = resolved.rejected
      else if (resolved.kilometres !== null) {
        kilometresToSave = resolved.kilometres
        if (resolved.warning && !distanceAck) {
          next.distanceAck = `${resolved.warning} Confirm below to save the odometer difference.`
        }
      }
    }
    let businessKilometres: number | null = null
    if (purpose === "mixed") {
      const portion = parseDecimal(businessKm, 1)
      if (portion === null) next.businessKm = "Enter the business kilometres for this mixed shift."
      else if (kilometresToSave !== null && portion > kilometresToSave) next.businessKm = "Business kilometres cannot exceed the trip."
      else businessKilometres = portion
    }
    const id = existing?.id ?? newId()
    const candidate: SpanRecord = {
      id,
      vehicleId: linkedVehicle,
      date,
      startOdometer: startReading === undefined ? null : startReading,
      endOdometer: endReading === undefined ? null : endReading,
      shiftId: null,
      isShift: true,
      overlapAcknowledged: overlapAck,
      businessKm: 0,
      recordedKm: kilometresToSave ?? 0,
    }
    const others: SpanRecord[] = [
      ...data.shifts
        .filter((shift) => shift.id !== id)
        .map((shift) => ({
          id: shift.id,
          vehicleId: shift.vehicleId ?? null,
          date: shift.date,
          startOdometer: shift.startOdometer ?? null,
          endOdometer: shift.endOdometer ?? null,
          shiftId: null,
          isShift: true,
          overlapAcknowledged: shift.overlapAcknowledged === true,
          businessKm: 0,
          recordedKm: shift.kilometres,
        })),
      ...data.mileage.map((entry) => ({
        id: entry.id,
        vehicleId: entry.vehicleId,
        date: entry.date,
        startOdometer: entry.startOdometer,
        endOdometer: entry.endOdometer,
        shiftId: entry.shiftId,
        isShift: false,
        overlapAcknowledged: entry.overlapAcknowledged,
        businessKm: 0,
        recordedKm: entry.kilometres,
      })),
    ]
    const overlaps = isISODate(date) ? findOverlaps(candidate, others) : []
    if (overlaps.length > 0 && !overlapAck) {
      next.overlap = "This overlaps another record on the same vehicle or the same shift. It will not be added into the annual business-kilometre total unless you confirm it is not a double count."
    }
    if (next.odometer || next.distanceAck || next.overlap || next.businessKm || next.startOdometer || next.endOdometer) {
      setLogOpen(true)
    }
    setErrors(next)
    if (
      Object.keys(next).length > 0 ||
      payout === null ||
      distance === null ||
      kilometresToSave === null ||
      orderCount === undefined ||
      startReading === undefined ||
      endReading === undefined
    ) {
      return
    }
    onSave({
      id,
      date,
      start,
      end,
      earnings: payout,
      kilometres: kilometresToSave,
      orders: orderCount,
      area: area.trim(),
      note: note.trim(),
      platform: platform.trim() || DEFAULT_PLATFORM,
      vehicleId: linkedVehicle,
      startOdometer: startReading,
      endOdometer: endReading,
      purpose,
      businessKilometres,
      businessPurpose: businessPurpose.trim(),
      evidenceId: evidenceId.trim() || null,
      overlapAcknowledged: overlapAck,
    })
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <DialogHeader className="pr-8">
        <DialogTitle>{existing ? "Edit shift" : "Add a shift"}</DialogTitle>
        <DialogDescription>
          Enter the payout you received, the clock times, and the kilometres you drove.
        </DialogDescription>
      </DialogHeader>
      <SampleNotice demo={demo} />
      <Field label="Date" htmlFor="shift-date" error={errors.date}>
        <Input className="h-10" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start" htmlFor="shift-start" error={errors.start}>
          <Input className="h-10" type="time" value={start} onChange={(event) => setStart(event.target.value)} />
        </Field>
        <Field
          label="End"
          htmlFor="shift-end"
          error={errors.end}
          hint="After midnight, enter the end time on the clock."
        >
          <Input className="h-10" type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
        </Field>
      </div>
      {hoursPreview ? <p className="text-xs text-muted-foreground">Counted time: {hoursPreview}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Payout (CAD)" htmlFor="shift-earnings" error={errors.earnings}>
          <Input
            className="h-10"
            inputMode="decimal"
            value={earnings}
            onChange={(event) => setEarnings(event.target.value)}
            placeholder="0.00"
          />
        </Field>
        <Field label="Kilometres" htmlFor="shift-km" error={errors.kilometres}>
          <Input
            className="h-10"
            inputMode="decimal"
            value={kilometres}
            onChange={(event) => setKilometres(event.target.value)}
            placeholder="0"
          />
        </Field>
      </div>
      <Field label="Orders" htmlFor="shift-orders" error={errors.orders} hint="Optional.">
        <Input className="h-10" inputMode="numeric" value={orders} onChange={(event) => setOrders(event.target.value)} />
      </Field>
      <Field label="Area" htmlFor="shift-area" hint="Optional. A zone or neighbourhood you want to remember.">
        <Input className="h-10" value={area} maxLength={60} onChange={(event) => setArea(event.target.value)} />
      </Field>
      <Field label="Note" htmlFor="shift-note" hint="Optional.">
        <textarea
          className={`${controlClass} min-h-20 py-2`}
          value={note}
          maxLength={180}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      <details className="rounded-lg border border-border px-3 py-2" open={logOpen} onToggle={(event) => setLogOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer text-sm font-medium">Vehicle log (optional)</summary>
        <div className="mt-3 grid gap-4">
          <p className="text-xs leading-5 text-muted-foreground">
            A shift still saves with only the payout, times, and kilometres. Kilometres stay unclassified for tax until you mark them business, personal, or mixed. Unclassified kilometres are not deducted.
          </p>
          <Field label="Delivery platform" htmlFor="shift-platform" hint="The app this shift was on. Starts from your default.">
            <Input className="h-10" value={platform} maxLength={40} onChange={(event) => setPlatform(event.target.value)} />
          </Field>
          {data.vehicles.length > 1 ? (
            <Field label="Vehicle" htmlFor="shift-vehicle" hint="Optional. Leave unlinked if this shift is not for one car.">
              <select className={controlClass} value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
                <option value="">Not linked</option>
                {data.vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {[vehicle.nickname, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehicle"}
                  </option>
                ))}
              </select>
            </Field>
          ) : onlyVehicle ? (
            <p className="text-xs text-muted-foreground">
              Odometer readings on this shift attach to {onlyVehicle.nickname || onlyVehicle.make || "your vehicle"}.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Add a vehicle under Vehicle & Tax Records if you want these readings on a car. The shift can still be saved.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start odometer" htmlFor="shift-odo-start" error={errors.startOdometer} hint="Optional.">
              <Input className="h-10" inputMode="numeric" value={startOdometer} onChange={(event) => { setStartOdometer(event.target.value); setDistanceAck(false) }} />
            </Field>
            <Field label="End odometer" htmlFor="shift-odo-end" error={errors.endOdometer} hint="Optional. Distance is end minus start.">
              <Input className="h-10" inputMode="numeric" value={endOdometer} onChange={(event) => { setEndOdometer(event.target.value); setDistanceAck(false) }} />
            </Field>
          </div>
          {errors.odometer ? <p className="text-xs text-destructive">{errors.odometer}</p> : null}
          {errors.distanceAck ? <p className="text-xs text-warning">{errors.distanceAck}</p> : null}
          {errors.distanceAck ? (
            <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <input type="checkbox" className="mt-0.5" checked={distanceAck} onChange={(event) => setDistanceAck(event.target.checked)} />
              Use the odometer difference instead of the typed kilometres.
            </label>
          ) : null}
          <Field label="Tax classification" htmlFor="shift-purpose" hint="Unclassified kilometres are missing for tax purposes. They are not treated as business.">
            <select className={controlClass} value={purpose} onChange={(event) => setPurpose(event.target.value as TripPurpose)}>
              {TRIP_PURPOSES.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </Field>
          {purpose === "mixed" ? (
            <Field label="Business kilometres" htmlFor="shift-business-km" error={errors.businessKm} hint="The rest of the trip is personal.">
              <Input className="h-10" inputMode="decimal" value={businessKm} onChange={(event) => setBusinessKm(event.target.value)} />
            </Field>
          ) : null}
          <Field label="Business purpose" htmlFor="shift-business" hint="Optional. What the business portion was for.">
            <Input className="h-10" value={businessPurpose} maxLength={180} onChange={(event) => setBusinessPurpose(event.target.value)} />
          </Field>
          <Field label="Evidence reference" htmlFor="shift-evidence" hint="Optional. A note or receipt id. A file is not required.">
            <Input className="h-10" value={evidenceId} maxLength={80} onChange={(event) => setEvidenceId(event.target.value)} />
          </Field>
          {errors.overlap ? <p className="text-xs text-warning">{errors.overlap}</p> : null}
          {errors.overlap ? (
            <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <input type="checkbox" className="mt-0.5" checked={overlapAck} onChange={(event) => setOverlapAck(event.target.checked)} />
              This is not a double count. Include it with the overlapping record.
            </label>
          ) : null}
        </div>
      </details>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{existing ? "Save changes" : "Save shift"}</Button>
      </DialogFooter>
    </form>
  )
}

export function ShiftDialog() {
  const { panel, closePanel, saveShift, demo, now } = useSkipPilot()
  const open = panel?.type === "shift"
  const existing = panel?.type === "shift" ? panel.shift : null
  const today = now ? formatISODate(now) : ""

  return (
    <Dialog open={open} onOpenChange={(value) => !value && closePanel()}>
      <DialogContent>
        {open ? (
          <ShiftForm
            key={existing?.id ?? "new"}
            existing={existing}
            today={today}
            demo={demo}
            onCancel={closePanel}
            onSave={saveShift}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function FuelForm({
  existing,
  today,
  demo,
  onCancel,
  onSave,
}: {
  existing: FuelFill | null
  today: string
  demo: boolean
  onCancel: () => void
  onSave: (fill: FuelFill) => void
}) {
  const [date, setDate] = useState(existing?.date ?? today)
  const [litres, setLitres] = useState(existing ? String(existing.litres) : "")
  const [price, setPrice] = useState(existing ? decimalInput(existing.pricePerLitre) : "")
  const [station, setStation] = useState(existing?.station ?? "")
  const [odometer, setOdometer] = useState(
    existing?.odometer === null || existing?.odometer === undefined ? "" : String(existing.odometer),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const litreValue = parseDecimal(litres, 2)
  const priceValue = parseDecimal(price, 3)
  const preview =
    litreValue !== null && litreValue > 0 && priceValue !== null && priceValue > 0
      ? formatCad(Math.round(litreValue * priceValue * 100) / 100)
      : null

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!isISODate(date)) next.date = "Choose the fill-up date."
    if (litreValue === null || litreValue <= 0) next.litres = "Enter the litres from the receipt."
    else if (litreValue > 200) next.litres = "Enter the litres for this fill-up only."
    if (priceValue === null || priceValue <= 0) next.price = "Enter the price per litre."
    else if (priceValue > 10) next.price = "Check the price per litre."
    const reading = parseOptionalInteger(odometer)
    if (reading === undefined) next.odometer = "Odometer should be a whole number, or left blank."
    setErrors(next)
    if (Object.keys(next).length > 0 || litreValue === null || priceValue === null || reading === undefined) return
    onSave({
      id: existing?.id ?? newId(),
      date,
      litres: litreValue,
      pricePerLitre: priceValue,
      total: Math.round(litreValue * priceValue * 100) / 100,
      station: station.trim(),
      odometer: reading,
    })
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <DialogHeader className="pr-8">
        <DialogTitle>{existing ? "Edit fill-up" : "Log a fill-up"}</DialogTitle>
        <DialogDescription>
          Use the litres and price per litre from the pump receipt. GoVio stores the total.
        </DialogDescription>
      </DialogHeader>
      <SampleNotice demo={demo} />
      <Field label="Date" htmlFor="fuel-date" error={errors.date}>
        <Input className="h-10" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Litres" htmlFor="fuel-litres" error={errors.litres}>
          <Input className="h-10" inputMode="decimal" value={litres} onChange={(event) => setLitres(event.target.value)} />
        </Field>
        <Field label="Price per litre (CAD)" htmlFor="fuel-price" error={errors.price}>
          <Input
            className="h-10"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="1.62"
          />
        </Field>
      </div>
      {preview ? <p className="text-xs text-muted-foreground">Receipt total: {preview}</p> : null}
      <Field label="Station" htmlFor="fuel-station" hint="Optional.">
        <Input className="h-10" value={station} maxLength={60} onChange={(event) => setStation(event.target.value)} />
      </Field>
      <Field label="Odometer (km)" htmlFor="fuel-odometer" error={errors.odometer} hint="Optional.">
        <Input className="h-10" inputMode="numeric" value={odometer} onChange={(event) => setOdometer(event.target.value)} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{existing ? "Save changes" : "Save fill-up"}</Button>
      </DialogFooter>
    </form>
  )
}

export function FuelDialog() {
  const { panel, closePanel, saveFuel, demo, now } = useSkipPilot()
  const open = panel?.type === "fuel"
  const existing = panel?.type === "fuel" ? panel.fill : null
  const today = now ? formatISODate(now) : ""

  return (
    <Dialog open={open} onOpenChange={(value) => !value && closePanel()}>
      <DialogContent>
        {open ? (
          <FuelForm
            key={existing?.id ?? "new"}
            existing={existing}
            today={today}
            demo={demo}
            onCancel={closePanel}
            onSave={saveFuel}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function BillForm({
  existing,
  demo,
  onCancel,
  onSave,
}: {
  existing: Bill | null
  demo: boolean
  onCancel: () => void
  onSave: (bill: Bill) => void
}) {
  const [name, setName] = useState(existing?.name ?? "")
  const [amount, setAmount] = useState(existing ? existing.amount.toFixed(2) : "")
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? "")
  const [category, setCategory] = useState<BillCategory>(existing?.category ?? "other")
  const [errors, setErrors] = useState<Record<string, string>>({})

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = "Name the bill."
    const value = parseDecimal(amount, 2)
    if (value === null || value <= 0) next.amount = "Enter an amount greater than zero."
    else if (value > 100_000) next.amount = "That amount is too large for one bill."
    if (!isISODate(dueDate)) next.due = "Choose a due date."
    setErrors(next)
    if (Object.keys(next).length > 0 || value === null) return
    onSave({
      id: existing?.id ?? newId(),
      name: name.trim(),
      amount: value,
      dueDate,
      category,
      paid: existing?.paid ?? false,
    })
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <DialogHeader className="pr-8">
        <DialogTitle>{existing ? "Edit bill" : "Add a bill"}</DialogTitle>
        <DialogDescription>
          Bills you add here are reminders. GoVio does not pay them or connect to a bank.
        </DialogDescription>
      </DialogHeader>
      <SampleNotice demo={demo} />
      <Field label="Name" htmlFor="bill-name" error={errors.name}>
        <Input className="h-10" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (CAD)" htmlFor="bill-amount" error={errors.amount}>
          <Input className="h-10" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <Field label="Due date" htmlFor="bill-due" error={errors.due}>
          <Input className="h-10" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </Field>
      </div>
      <Field label="Category" htmlFor="bill-category">
        <select
          className={controlClass}
          value={category}
          onChange={(event) => setCategory(event.target.value as BillCategory)}
        >
          {BILL_CATEGORIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{existing ? "Save changes" : "Save bill"}</Button>
      </DialogFooter>
    </form>
  )
}

export function BillDialog() {
  const { panel, closePanel, saveBill, demo } = useSkipPilot()
  const open = panel?.type === "bill"
  const existing = panel?.type === "bill" ? panel.bill : null

  return (
    <Dialog open={open} onOpenChange={(value) => !value && closePanel()}>
      <DialogContent>
        {open ? (
          <BillForm
            key={existing?.id ?? "new"}
            existing={existing}
            demo={demo}
            onCancel={closePanel}
            onSave={saveBill}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export function ConfirmDialog() {
  const { panel, closePanel, confirmPanel, data } = useSkipPilot()
  const open = panel?.type === "confirm"
  const confirm = panel?.type === "confirm" ? panel.confirm : null

  let title = "Confirm"
  let description = ""
  let action = "Confirm"
  let destructive = false

  if (confirm?.type === "delete-shift") {
    const shift = data.shifts.find((item) => item.id === confirm.id)
    title = "Delete this shift?"
    description = shift
      ? `The ${formatWeekdayDate(shift.date)} shift will be removed from this browser.`
      : "This shift will be removed from this browser."
    action = "Delete shift"
    destructive = true
  } else if (confirm?.type === "delete-fuel") {
    title = "Delete this fill-up?"
    description = "The receipt will be removed from this browser. Weekly fuel math will update."
    action = "Delete fill-up"
    destructive = true
  } else if (confirm?.type === "delete-bill") {
    const bill = data.bills.find((item) => item.id === confirm.id)
    title = "Delete this bill?"
    description = bill ? `${bill.name} will be removed from this browser.` : "This bill will be removed from this browser."
    action = "Delete bill"
    destructive = true
  } else if (confirm?.type === "load-sample") {
    title = "Preview a sample week?"
    description =
      "Illustrated shifts, a fill-up, and bills replace what is on screen. Your current ledger is kept and comes back when you clear the sample."
    action = "Load sample week"
  } else if (confirm?.type === "clear-sample") {
    title = "Clear the sample week?"
    description =
      "The illustrated figures are removed, including anything you added during the preview. The ledger from before the sample comes back."
    action = "Clear sample data"
    destructive = true
  } else if (confirm?.type === "clear-all") {
    title = "Clear the ledger?"
    description =
      "Shifts, fill-ups, bills, vehicle records, and receipt photos stored in this browser are deleted. If a photo cannot be removed, you will be told."
    action = "Clear ledger"
    destructive = true
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && closePanel()}>
      <DialogContent>
        <DialogHeader className="pr-8">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={closePanel}>
            Cancel
          </Button>
          <Button type="button" variant={destructive ? "destructive" : "default"} onClick={confirmPanel}>
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
