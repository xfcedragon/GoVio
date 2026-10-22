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
import { isISODate } from "@/lib/dates"
import { parseDecimal, parseOptionalInteger } from "@/lib/parse"
import { deleteReceiptImage, hashBlob, MAX_RECEIPT_BYTES, putReceiptImage } from "@/lib/receipts-db"
import {
  CLAIM_STATUSES,
  FUEL_TYPES,
  TRIP_PURPOSES,
  VEHICLE_EXPENSE_CATEGORIES,
  type ClaimStatus,
  type FuelFill,
  type FuelType,
  type MileageEntry,
  type Shift,
  type TripPurpose,
  type Vehicle,
  type VehicleExpense,
  type VehicleExpenseCategory,
} from "@/lib/types"
import { findDuplicateExpenses, findOverlaps, resolveTripKilometres, vehicleLabel, type SpanRecord } from "@/lib/vehicle"

function newId() {
  return crypto.randomUUID()
}

export function VehicleDialog({
  open,
  vehicle,
  today,
  onClose,
  onSave,
}: {
  open: boolean
  vehicle: Vehicle | null
  today: string
  onClose: () => void
  onSave: (vehicle: Vehicle, reading: { date: string; kilometres: number } | null) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        {open ? (
          <VehicleForm key={vehicle?.id ?? "new"} vehicle={vehicle} today={today} onClose={onClose} onSave={onSave} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function VehicleForm({
  vehicle,
  today,
  onClose,
  onSave,
}: {
  vehicle: Vehicle | null
  today: string
  onClose: () => void
  onSave: (vehicle: Vehicle, reading: { date: string; kilometres: number } | null) => void
}) {
  const [make, setMake] = useState(vehicle?.make ?? "")
  const [model, setModel] = useState(vehicle?.model ?? "")
  const [year, setYear] = useState(vehicle?.year === null || vehicle?.year === undefined ? "" : String(vehicle.year))
  const [nickname, setNickname] = useState(vehicle?.nickname ?? "")
  const [fuelType, setFuelType] = useState<FuelType>(vehicle?.fuelType ?? "gasoline")
  const [litres, setLitres] = useState(vehicle?.litresPer100km === null || !vehicle ? "" : String(vehicle.litresPer100km))
  const [wear, setWear] = useState(vehicle?.wearPerKm === null || !vehicle ? "" : String(vehicle.wearPerKm))
  const [initialKm, setInitialKm] = useState(
    vehicle?.initialOdometer === null || vehicle?.initialOdometer === undefined ? "" : String(vehicle.initialOdometer),
  )
  const [initialDate, setInitialDate] = useState(vehicle?.initialOdometerDate ?? "")
  const [currentKm, setCurrentKm] = useState("")
  const [currentDate, setCurrentDate] = useState(today)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!make.trim() && !model.trim() && !nickname.trim()) next.make = "Enter a make, model, or nickname."
    const yearValue = parseOptionalInteger(year)
    if (yearValue === undefined) next.year = "Year should be a whole number, or left blank."
    else if (yearValue !== null && (yearValue < 1980 || yearValue > 2100)) next.year = "Enter the model year."
    let litresValue: number | null = null
    if (litres.trim()) {
      const parsed = parseDecimal(litres, 1)
      if (parsed === null || parsed <= 0 || parsed > 40) next.litres = "Enter litres per 100 km, for example 8.4, or leave it blank."
      else litresValue = parsed
    }
    let wearValue: number | null = null
    if (wear.trim()) {
      const parsed = parseDecimal(wear, 3)
      if (parsed === null || parsed <= 0 || parsed > 5) next.wear = "Enter a cost per kilometre, for example 0.12, or leave it blank."
      else wearValue = parsed
    }
    const initial = parseOptionalInteger(initialKm)
    if (initial === undefined) next.initialKm = "Initial odometer should be a whole number, or left blank."
    if ((initial !== null && initial !== undefined && !isISODate(initialDate)) || (isISODate(initialDate) && (initial === null || initial === undefined))) {
      next.initialDate = "Enter both the initial odometer and the date of that reading."
    }
    let reading: { date: string; kilometres: number } | null = null
    const current = parseOptionalInteger(currentKm)
    if (current === undefined) next.currentKm = "Current odometer should be a whole number, or left blank."
    if (current !== null && current !== undefined) {
      if (!isISODate(currentDate)) next.currentDate = "Choose the date of this reading."
      else reading = { date: currentDate, kilometres: current }
    }
    setErrors(next)
    if (Object.keys(next).length > 0 || yearValue === undefined || initial === undefined || current === undefined) return
    onSave(
      {
        id: vehicle?.id ?? newId(),
        make: make.trim(),
        model: model.trim(),
        year: yearValue,
        nickname: nickname.trim(),
        fuelType,
        litresPer100km: litresValue,
        wearPerKm: wearValue,
        initialOdometer: initial,
        initialOdometerDate: initial !== null && isISODate(initialDate) ? initialDate : null,
      },
      reading,
    )
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <DialogHeader className="pr-8">
        <DialogTitle>{vehicle ? "Edit vehicle" : "Add a vehicle"}</DialogTitle>
        <DialogDescription>
          One vehicle is enough. A second car can be added later, and trips can point at it. Updating the current odometer adds a reading. It does not erase earlier ones.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Make" htmlFor="vehicle-make" error={errors.make}>
          <Input className="h-10" value={make} maxLength={40} onChange={(event) => setMake(event.target.value)} />
        </Field>
        <Field label="Model" htmlFor="vehicle-model">
          <Input className="h-10" value={model} maxLength={40} onChange={(event) => setModel(event.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Year" htmlFor="vehicle-year" error={errors.year} hint="Optional.">
          <Input className="h-10" inputMode="numeric" value={year} onChange={(event) => setYear(event.target.value)} />
        </Field>
        <Field label="Nickname" htmlFor="vehicle-nickname" hint="Optional.">
          <Input className="h-10" value={nickname} maxLength={40} onChange={(event) => setNickname(event.target.value)} />
        </Field>
      </div>
      <Field label="Fuel type" htmlFor="vehicle-fuel">
        <select className={controlClass} value={fuelType} onChange={(event) => setFuelType(event.target.value as FuelType)}>
          {FUEL_TYPES.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </Field>
      <Field
        label="Fuel use (L/100 km)"
        htmlFor="vehicle-litres"
        error={errors.litres}
        hint="Optional. Used for this vehicle's fuel-consumed estimate. Settings keeps the ledger rate for Hourly Earnings."
      >
        <Input className="h-10" inputMode="decimal" value={litres} onChange={(event) => setLitres(event.target.value)} placeholder="8.4" />
      </Field>
      <Field
        label="Estimated wear ($/km)"
        htmlFor="vehicle-wear"
        error={errors.wear}
        hint="Optional. An estimate only. It is not included in claimed totals."
      >
        <Input className="h-10" inputMode="decimal" value={wear} onChange={(event) => setWear(event.target.value)} placeholder="0.12" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Initial odometer" htmlFor="vehicle-initial" error={errors.initialKm} hint="The starting reading you want kept.">
          <Input className="h-10" inputMode="numeric" value={initialKm} onChange={(event) => setInitialKm(event.target.value)} />
        </Field>
        <Field label="Initial reading date" htmlFor="vehicle-initial-date" error={errors.initialDate}>
          <Input className="h-10" type="date" value={initialDate} onChange={(event) => setInitialDate(event.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Add current odometer" htmlFor="vehicle-current" error={errors.currentKm} hint="Leave blank to keep history as it is.">
          <Input className="h-10" inputMode="numeric" value={currentKm} onChange={(event) => setCurrentKm(event.target.value)} />
        </Field>
        <Field label="Date of that reading" htmlFor="vehicle-current-date" error={errors.currentDate}>
          <Input className="h-10" type="date" value={currentDate} onChange={(event) => setCurrentDate(event.target.value)} />
        </Field>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit">{vehicle ? "Save vehicle" : "Add vehicle"}</Button>
      </DialogFooter>
    </form>
  )
}

export function MileageDialog({
  open,
  entry,
  today,
  vehicles,
  shifts,
  mileage,
  onClose,
  onSave,
}: {
  open: boolean
  entry: MileageEntry | null
  today: string
  vehicles: Vehicle[]
  shifts: Shift[]
  mileage: MileageEntry[]
  onClose: () => void
  onSave: (entry: MileageEntry) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        {open ? (
          <MileageForm
            key={entry?.id ?? "new"}
            entry={entry}
            today={today}
            vehicles={vehicles}
            shifts={shifts}
            mileage={mileage}
            onClose={onClose}
            onSave={onSave}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function MileageForm({
  entry,
  today,
  vehicles,
  shifts,
  mileage,
  onClose,
  onSave,
}: {
  entry: MileageEntry | null
  today: string
  vehicles: Vehicle[]
  shifts: Shift[]
  mileage: MileageEntry[]
  onClose: () => void
  onSave: (entry: MileageEntry) => void
}) {
  const only = vehicles.length === 1 ? vehicles[0].id : ""
  const [date, setDate] = useState(entry?.date ?? today)
  const [vehicleId, setVehicleId] = useState(entry?.vehicleId ?? only)
  const [startOdometer, setStartOdometer] = useState(entry?.startOdometer === null || entry?.startOdometer === undefined ? "" : String(entry.startOdometer))
  const [endOdometer, setEndOdometer] = useState(entry?.endOdometer === null || entry?.endOdometer === undefined ? "" : String(entry.endOdometer))
  const [kilometres, setKilometres] = useState(entry ? String(entry.kilometres) : "")
  const [purpose, setPurpose] = useState<TripPurpose>(entry?.purpose ?? "unclassified")
  const [businessKm, setBusinessKm] = useState(entry?.businessKilometres === null || entry?.businessKilometres === undefined ? "" : String(entry.businessKilometres))
  const [description, setDescription] = useState(entry?.description ?? "")
  const [note, setNote] = useState(entry?.note ?? "")
  const [evidenceId, setEvidenceId] = useState(entry?.evidenceId ?? "")
  const [shiftId, setShiftId] = useState(entry?.shiftId ?? "")
  const [distanceAck, setDistanceAck] = useState(false)
  const [overlapAck, setOverlapAck] = useState(entry?.overlapAcknowledged ?? false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!isISODate(date)) next.date = "Choose the trip date."
    const startReading = parseOptionalInteger(startOdometer)
    const endReading = parseOptionalInteger(endOdometer)
    if (startReading === undefined) next.startOdometer = "Starting odometer should be a whole number, or left blank."
    if (endReading === undefined) next.endOdometer = "Ending odometer should be a whole number, or left blank."
    const typed = kilometres.trim() === "" ? null : parseDecimal(kilometres, 1)
    if (kilometres.trim() && typed === null) next.kilometres = "Enter kilometres as a number."
    else if (typed !== null && typed > 2_000) next.kilometres = "Enter the kilometres for this trip only."
    const hasOdometerPair = startReading !== null && startReading !== undefined && endReading !== null && endReading !== undefined
    if (!hasOdometerPair && typed === null) next.kilometres = "Enter kilometres, or both odometer readings."
    let kilometresToSave = typed ?? 0
    if (startReading !== undefined && endReading !== undefined && startReading !== null && endReading !== null) {
      const resolved = resolveTripKilometres({
        startOdometer: startReading,
        endOdometer: endReading,
        enteredKilometres: typed,
      })
      if (resolved.rejected) next.odometer = resolved.rejected
      else if (resolved.kilometres !== null) {
        kilometresToSave = resolved.kilometres
        if (resolved.warning && !distanceAck) next.distanceAck = `${resolved.warning} Confirm below to save the odometer difference.`
      }
    }
    let businessKilometres: number | null = null
    if (purpose === "mixed") {
      const portion = parseDecimal(businessKm, 1)
      if (portion === null) next.businessKm = "Enter the business kilometres."
      else if (portion > kilometresToSave) next.businessKm = "Business kilometres cannot exceed the trip."
      else businessKilometres = portion
    }
    const id = entry?.id ?? newId()
    const linkedVehicle = vehicleId || null
    const candidate: SpanRecord = {
      id,
      vehicleId: linkedVehicle,
      date,
      startOdometer: startReading === undefined ? null : startReading,
      endOdometer: endReading === undefined ? null : endReading,
      shiftId: shiftId || null,
      isShift: false,
      overlapAcknowledged: overlapAck,
      businessKm: 0,
      recordedKm: kilometresToSave,
    }
    const others: SpanRecord[] = [
      ...shifts.map((shift) => ({
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
      ...mileage
        .filter((item) => item.id !== id)
        .map((item) => ({
          id: item.id,
          vehicleId: item.vehicleId,
          date: item.date,
          startOdometer: item.startOdometer,
          endOdometer: item.endOdometer,
          shiftId: item.shiftId,
          isShift: false,
          overlapAcknowledged: item.overlapAcknowledged,
          businessKm: 0,
          recordedKm: item.kilometres,
        })),
    ]
    const overlaps = isISODate(date) ? findOverlaps(candidate, others) : []
    if (overlaps.length > 0 && !overlapAck) {
      next.overlap = "This covers the same odometer span or the same shift as another record. It will stay out of the annual business-kilometre total unless you confirm it is not a double count."
    }
    setErrors(next)
    if (Object.keys(next).length > 0 || startReading === undefined || endReading === undefined) return
    onSave({
      id,
      vehicleId: linkedVehicle,
      date,
      startOdometer: startReading,
      endOdometer: endReading,
      kilometres: kilometresToSave,
      purpose,
      businessKilometres,
      description: description.trim(),
      note: note.trim(),
      evidenceId: evidenceId.trim() || null,
      shiftId: shiftId || null,
      overlapAcknowledged: overlapAck,
    })
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <DialogHeader className="pr-8">
        <DialogTitle>{entry ? "Edit mileage entry" : "Add mileage"}</DialogTitle>
        <DialogDescription>
          This is a trip log, separate from a shift. Link it to a shift only when it is the tax record for that shift. Leave the link blank for a personal errand or any drive that is not a delivery shift.
        </DialogDescription>
      </DialogHeader>
      <Field label="Date" htmlFor="mile-date" error={errors.date}>
        <Input className="h-10" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </Field>
      {vehicles.length > 1 ? (
        <Field label="Vehicle" htmlFor="mile-vehicle">
          <select className={controlClass} value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
            <option value="">Not linked</option>
            {vehicles.map((item) => (
              <option key={item.id} value={item.id}>{vehicleLabel(item)}</option>
            ))}
          </select>
        </Field>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start odometer" htmlFor="mile-start" error={errors.startOdometer} hint="Optional.">
          <Input className="h-10" inputMode="numeric" value={startOdometer} onChange={(event) => { setStartOdometer(event.target.value); setDistanceAck(false) }} />
        </Field>
        <Field label="End odometer" htmlFor="mile-end" error={errors.endOdometer} hint="Distance is end minus start when both are valid.">
          <Input className="h-10" inputMode="numeric" value={endOdometer} onChange={(event) => { setEndOdometer(event.target.value); setDistanceAck(false) }} />
        </Field>
      </div>
      <Field label="Kilometres" htmlFor="mile-km" error={errors.kilometres} hint="Used when odometer readings are missing. If both readings are valid, the difference is preferred.">
        <Input className="h-10" inputMode="decimal" value={kilometres} onChange={(event) => { setKilometres(event.target.value); setDistanceAck(false) }} />
      </Field>
      {errors.odometer ? <p className="text-xs text-destructive">{errors.odometer}</p> : null}
      {errors.distanceAck ? <p className="text-xs text-warning">{errors.distanceAck}</p> : null}
      {errors.distanceAck ? (
        <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <input type="checkbox" className="mt-0.5" checked={distanceAck} onChange={(event) => setDistanceAck(event.target.checked)} />
          Use the odometer difference instead of the typed kilometres.
        </label>
      ) : null}
      <Field label="Classification" htmlFor="mile-purpose" hint="Unclassified kilometres are missing for tax purposes.">
        <select className={controlClass} value={purpose} onChange={(event) => setPurpose(event.target.value as TripPurpose)}>
          {TRIP_PURPOSES.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </Field>
      {purpose === "mixed" ? (
        <Field label="Business kilometres" htmlFor="mile-business" error={errors.businessKm}>
          <Input className="h-10" inputMode="decimal" value={businessKm} onChange={(event) => setBusinessKm(event.target.value)} />
        </Field>
      ) : null}
      <Field label="Business purpose" htmlFor="mile-description" hint="What the trip was for. Optional, and not required as evidence.">
        <Input className="h-10" value={description} maxLength={180} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      <Field label="Link to a shift" htmlFor="mile-shift" hint="Leave blank for a non-shift trip. Linking does not create a second copy of that shift's kilometres.">
        <select className={controlClass} value={shiftId} onChange={(event) => setShiftId(event.target.value)}>
          <option value="">Not a shift</option>
          {shifts.map((shift) => (
            <option key={shift.id} value={shift.id}>{shift.date} · {shift.area || "Shift"} · {shift.kilometres} km</option>
          ))}
        </select>
      </Field>
      <Field label="Note" htmlFor="mile-note" hint="Optional.">
        <textarea className={`${controlClass} min-h-16 py-2`} value={note} maxLength={180} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <Field label="Evidence reference" htmlFor="mile-evidence" hint="Optional. A note or receipt id. A file is not required.">
        <Input className="h-10" value={evidenceId} maxLength={80} onChange={(event) => setEvidenceId(event.target.value)} />
      </Field>
      {errors.overlap ? <p className="text-xs text-warning">{errors.overlap}</p> : null}
      {errors.overlap ? (
        <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <input type="checkbox" className="mt-0.5" checked={overlapAck} onChange={(event) => setOverlapAck(event.target.checked)} />
          This is not a double count. Include it with the overlapping record.
        </label>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit">{entry ? "Save mileage" : "Save mileage"}</Button>
      </DialogFooter>
    </form>
  )
}

export function ExpenseDialog({
  open,
  expense,
  today,
  vehicles,
  expenses,
  fuel,
  onClose,
  onSave,
  onNotify,
}: {
  open: boolean
  expense: VehicleExpense | null
  today: string
  vehicles: Vehicle[]
  expenses: VehicleExpense[]
  fuel: FuelFill[]
  onClose: () => void
  onSave: (expense: VehicleExpense) => boolean
  onNotify: (message: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent>
        {open ? (
          <ExpenseForm
            key={expense?.id ?? "new"}
            expense={expense}
            today={today}
            vehicles={vehicles}
            expenses={expenses}
            fuel={fuel}
            onClose={onClose}
            onSave={onSave}
            onNotify={onNotify}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ExpenseForm({
  expense,
  today,
  vehicles,
  expenses,
  fuel,
  onClose,
  onSave,
  onNotify,
}: {
  expense: VehicleExpense | null
  today: string
  vehicles: Vehicle[]
  expenses: VehicleExpense[]
  fuel: FuelFill[]
  onClose: () => void
  onSave: (expense: VehicleExpense) => boolean
  onNotify: (message: string) => void
}) {
  const only = vehicles.length === 1 ? vehicles[0].id : ""
  const [vehicleId, setVehicleId] = useState(expense?.vehicleId ?? only)
  const [category, setCategory] = useState<VehicleExpenseCategory>(expense?.category ?? "fuel")
  const [merchant, setMerchant] = useState(expense?.merchant ?? "")
  const [date, setDate] = useState(expense?.date ?? "")
  const [fuelType, setFuelType] = useState(expense?.fuelType ?? "")
  const [litres, setLitres] = useState(expense?.litres === null || expense?.litres === undefined ? "" : String(expense.litres))
  const [price, setPrice] = useState(expense?.pricePerLitre === null || expense?.pricePerLitre === undefined ? "" : String(expense.pricePerLitre))
  const [subtotal, setSubtotal] = useState(expense?.subtotal === null || expense?.subtotal === undefined ? "" : String(expense.subtotal))
  const [tax, setTax] = useState(expense?.tax === null || expense?.tax === undefined ? "" : String(expense.tax))
  const [total, setTotal] = useState(expense ? String(expense.total) : "")
  const [currency, setCurrency] = useState(expense?.currency ?? "CAD")
  const [claimStatus, setClaimStatus] = useState<ClaimStatus>(expense?.claimStatus ?? "unreviewed")
  const [note, setNote] = useState(expense?.note ?? "")
  const [fuelFillId, setFuelFillId] = useState(expense?.fuelFillId ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [hash, setHash] = useState<string | null>(expense?.imageHash ?? null)
  const [hashNote, setHashNote] = useState<string | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [duplicateAck, setDuplicateAck] = useState(expense?.duplicateAcknowledged ?? false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  async function onFile(next: File | null) {
    setFile(next)
    setDuplicateAck(false)
    setHashNote(null)
    if (!next) {
      setHash(expense?.imageHash ?? null)
      return
    }
    if (next.size > MAX_RECEIPT_BYTES) {
      setFile(null)
      setHash(null)
      setHashNote("That photo is larger than 8 MB. Choose a smaller one, or save the receipt without a photo.")
      return
    }
    const digest = await hashBlob(next)
    if (!digest) {
      setHash(null)
      setHashNote("This photo could not be fingerprinted, so a matching image will not be detected.")
      return
    }
    setHash(digest)
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (!isISODate(date)) next.date = "Enter the purchase date on the receipt."
    const totalValue = parseDecimal(total, 2)
    if (totalValue === null || totalValue < 0) next.total = "Enter the total from the receipt."
    else if (totalValue > 100_000) next.total = "That total is too large for one receipt."
    const litreValue = litres.trim() === "" ? null : parseDecimal(litres, 2)
    if (litres.trim() && (litreValue === null || litreValue <= 0)) next.litres = "Enter litres, or leave the field blank."
    const priceValue = price.trim() === "" ? null : parseDecimal(price, 3)
    if (price.trim() && (priceValue === null || priceValue <= 0)) next.price = "Enter the price per litre, or leave it blank."
    const subtotalValue = subtotal.trim() === "" ? null : parseDecimal(subtotal, 2)
    if (subtotal.trim() && subtotalValue === null) next.subtotal = "Enter the subtotal, or leave it blank."
    const taxValue = tax.trim() === "" ? null : parseDecimal(tax, 2)
    if (tax.trim() && taxValue === null) next.tax = "Enter the tax, or leave it blank."
    const id = expense?.id ?? newId()
    if (totalValue !== null && isISODate(date)) {
      const candidates = [
        ...expenses
          .filter((item) => item.id !== id)
          .map((item) => ({
            id: item.id,
            date: item.date,
            total: item.total,
            merchant: item.merchant,
            imageHash: item.imageHash,
          })),
        ...fuel
          .filter((fill) => fill.id !== fuelFillId)
          .map((fill) => ({
            id: fill.id,
            date: fill.date,
            total: fill.total,
            merchant: fill.station,
            imageHash: null,
          })),
      ]
      const duplicates = findDuplicateExpenses(
        { id, date, total: totalValue, merchant: merchant.trim(), imageHash: hash },
        candidates,
      )
      if (duplicates.length > 0 && !duplicateAck) {
        next.duplicate = "A receipt or fill-up with the same photo, or the same date, total, and merchant, is already saved. Confirm below if this is not a duplicate."
      }
    }
    setErrors(next)
    if (Object.keys(next).length > 0 || totalValue === null) return

    let imageId = removeImage ? null : expense?.imageId ?? null
    let imageName = removeImage ? "" : expense?.imageName ?? ""
    let imageHash = removeImage ? null : expense?.imageHash ?? null
    let imageSaved = removeImage ? false : expense?.imageSaved ?? false
    const previousImageId = expense?.imageId ?? null

    setSaving(true)
    if (file) {
      const stored = await putReceiptImage(id, file, file.name)
      if (!stored.ok) {
        setSaving(false)
        const blocked = stored.reason === "quota" || stored.reason === "too-large" || stored.reason === "unavailable"
        onNotify(
          blocked
            ? "This browser blocked saving the photo. The receipt was not saved. Remove the photo or choose a smaller one, then enter the amounts again."
            : "The photo could not be stored. The receipt was not saved, and the photo was not kept.",
        )
        return
      }
      imageId = id
      imageName = file.name
      imageHash = stored.hash
      imageSaved = true
    }

    const saved = onSave({
      id,
      vehicleId: vehicleId || null,
      category,
      merchant: merchant.trim(),
      date,
      fuelType: fuelType.trim(),
      litres: litreValue,
      pricePerLitre: priceValue,
      subtotal: subtotalValue,
      tax: taxValue,
      total: totalValue,
      currency: currency.trim().toUpperCase() || "CAD",
      claimStatus,
      note: note.trim(),
      imageId,
      imageName,
      imageHash,
      imageSaved,
      fuelFillId: fuelFillId || null,
      uploadedAt: file && isISODate(today) ? today : expense?.uploadedAt ?? null,
      duplicateAcknowledged: duplicateAck,
    })
    if (!saved) {
      if (file && imageId) await deleteReceiptImage(imageId)
      setSaving(false)
      onNotify("This browser blocked saving. The receipt was not kept.")
      return
    }
    if ((removeImage || file) && previousImageId && previousImageId !== imageId) {
      const removed = await deleteReceiptImage(previousImageId)
      if (!removed) onNotify("The new receipt was saved. The previous photo may still be in this browser.")
    }
    setSaving(false)
    onClose()
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <DialogHeader className="pr-8">
        <DialogTitle>{expense ? "Edit receipt" : "Add a receipt or expense"}</DialogTitle>
        <DialogDescription>
          Automatic receipt reading is not available. GoVio does not scan photos and did not fill these fields. Type the merchant, date, and amounts yourself. Saving stores what you typed.
        </DialogDescription>
      </DialogHeader>
      <p className="rounded-md border border-border bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
        The photo, if you add one, stays in this browser&apos;s IndexedDB and is linked by receipt id. It is not uploaded and does not sync to another device. Clearing site data deletes it with the ledger. If saving the photo fails, it is not marked as saved.
      </p>
      <Field label="Receipt photo" htmlFor="expense-file" hint="Optional. You can save the amounts with no image.">
        <input
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-foreground"
          type="file"
          accept="image/*,.pdf"
          onChange={(event) => void onFile(event.target.files?.[0] ?? null)}
        />
      </Field>
      {hashNote ? <p className="text-xs text-warning">{hashNote}</p> : null}
      {expense?.imageSaved && !removeImage && !file ? (
        <p className="text-xs text-muted-foreground">
          Stored photo: {expense.imageName || expense.id}. It can be opened from the receipt list.
          <button type="button" className="ml-2 text-foreground underline decoration-white/25 underline-offset-2 hover:decoration-foreground" onClick={() => { setRemoveImage(true); setHash(null) }}>
            Remove photo
          </button>
        </p>
      ) : null}
      {vehicles.length > 1 ? (
        <Field label="Vehicle" htmlFor="expense-vehicle">
          <select className={controlClass} value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
            <option value="">Not linked</option>
            {vehicles.map((item) => (
              <option key={item.id} value={item.id}>{vehicleLabel(item)}</option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Category" htmlFor="expense-category" hint="You choose this. Nothing was detected from a photo.">
        <select className={controlClass} value={category} onChange={(event) => setCategory(event.target.value as VehicleExpenseCategory)}>
          {VEHICLE_EXPENSE_CATEGORIES.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Merchant" htmlFor="expense-merchant" hint="Leave blank if the receipt has no name you want to store.">
        <Input className="h-10" value={merchant} maxLength={80} onChange={(event) => { setMerchant(event.target.value); setDuplicateAck(false) }} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Purchase date" htmlFor="expense-date" error={errors.date} hint="The date on the receipt, even if you upload it later.">
          <Input className="h-10" type="date" value={date} onChange={(event) => { setDate(event.target.value); setDuplicateAck(false) }} />
        </Field>
        <Field label="Currency" htmlFor="expense-currency" hint="CAD totals are the ones added up. Other currencies are listed and left out.">
          <Input className="h-10" value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value)} />
        </Field>
      </div>
      <Field label="Fuel type on the receipt" htmlFor="expense-fuel-type" hint="Optional. Blank if this is not a fuel receipt or you are unsure.">
        <Input className="h-10" value={fuelType} maxLength={40} onChange={(event) => setFuelType(event.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Litres" htmlFor="expense-litres" error={errors.litres} hint="Blank if unknown.">
          <Input className="h-10" inputMode="decimal" value={litres} onChange={(event) => setLitres(event.target.value)} />
        </Field>
        <Field label="Price per litre" htmlFor="expense-price" error={errors.price} hint="Blank if unknown.">
          <Input className="h-10" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subtotal" htmlFor="expense-subtotal" error={errors.subtotal} hint="Blank if you only have the total.">
          <Input className="h-10" inputMode="decimal" value={subtotal} onChange={(event) => setSubtotal(event.target.value)} />
        </Field>
        <Field label="Tax" htmlFor="expense-tax" error={errors.tax} hint="Blank if unknown.">
          <Input className="h-10" inputMode="decimal" value={tax} onChange={(event) => setTax(event.target.value)} />
        </Field>
      </div>
      <Field label="Total" htmlFor="expense-total" error={errors.total}>
        <Input className="h-10" inputMode="decimal" value={total} onChange={(event) => { setTotal(event.target.value); setDuplicateAck(false) }} placeholder="0.00" />
      </Field>
      <Field label="Your classification" htmlFor="expense-claim" hint="Unreviewed amounts are not included in the claimed total. This is your label, not a CRA decision.">
        <select className={controlClass} value={claimStatus} onChange={(event) => setClaimStatus(event.target.value as ClaimStatus)}>
          {CLAIM_STATUSES.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Same purchase as a logged fill-up" htmlFor="expense-fill" hint="Choose this when the Fuel page already has the purchase, so the cash total counts it once.">
        <select className={controlClass} value={fuelFillId} onChange={(event) => setFuelFillId(event.target.value)}>
          <option value="">Not linked</option>
          {fuel.map((fill) => (
            <option key={fill.id} value={fill.id}>{fill.date} · ${fill.total.toFixed(2)} · {fill.station || "Fill-up"}</option>
          ))}
        </select>
      </Field>
      <Field label="Note" htmlFor="expense-note" hint="Optional.">
        <textarea className={`${controlClass} min-h-16 py-2`} value={note} maxLength={180} onChange={(event) => setNote(event.target.value)} />
      </Field>
      {errors.duplicate ? <p className="text-xs text-warning">{errors.duplicate}</p> : null}
      {errors.duplicate ? (
        <label className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <input type="checkbox" className="mt-0.5" checked={duplicateAck} onChange={(event) => setDuplicateAck(event.target.checked)} />
          This is not a duplicate. Save it anyway.
        </label>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save receipt"}</Button>
      </DialogFooter>
    </form>
  )
}
