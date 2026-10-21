import { roundKm, roundMoney } from "@/lib/format"
import {
  DEFAULT_PLATFORM,
  VEHICLE_EXPENSE_CATEGORIES,
  type ClaimStatus,
  type FuelFill,
  type MileageEntry,
  type OdometerReading,
  type Settings,
  type Shift,
  type TripPurpose,
  type Vehicle,
  type VehicleExpense,
  type VehicleExpenseCategory,
  type YearCoverage,
} from "@/lib/types"

/** One trip longer than this is rejected as an odometer jump, matching the shift form. */
export const MAX_TRIP_KM = 2_000

/** Typed kilometres and an odometer difference disagree when they differ by more than this. */
export const MATERIAL_KM_GAP = 1

export type DistanceSource = "odometer" | "entered" | "missing"

export type OdometerDistance =
  | { ok: true; kilometres: number }
  | { ok: false; reason: "end-before-start" | "absurd-jump" | "invalid" }

/**
 * Distance is the ending odometer minus the starting odometer.
 * Ending below the start is rejected. A jump above MAX_TRIP_KM is rejected.
 */
export function distanceFromOdometer(start: number, end: number): OdometerDistance {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < 0) {
    return { ok: false, reason: "invalid" }
  }
  if (end < start) return { ok: false, reason: "end-before-start" }
  const kilometres = roundKm(end - start)
  if (kilometres > MAX_TRIP_KM) return { ok: false, reason: "absurd-jump" }
  return { ok: true, kilometres }
}

export type ResolvedDistance = {
  kilometres: number | null
  source: DistanceSource
  /** Set when a valid odometer difference replaces a materially different typed figure. */
  warning: string | null
  /** Set when the odometer pair itself is not usable. The form should block on this. */
  rejected: string | null
}

/**
 * When both readings are valid, the odometer difference wins over typed kilometres.
 * A material disagreement is returned as a warning rather than a silent choice.
 * Invalid readings are rejected. Typed kilometres remain available as an entered figure.
 */
export function resolveTripKilometres(input: {
  startOdometer: number | null
  endOdometer: number | null
  enteredKilometres: number | null
}): ResolvedDistance {
  const entered =
    input.enteredKilometres !== null &&
    Number.isFinite(input.enteredKilometres) &&
    input.enteredKilometres >= 0 &&
    input.enteredKilometres <= MAX_TRIP_KM
      ? roundKm(input.enteredKilometres)
      : null

  const hasPair = input.startOdometer !== null && input.endOdometer !== null
  if (hasPair) {
    const measured = distanceFromOdometer(input.startOdometer as number, input.endOdometer as number)
    if (!measured.ok) {
      const rejected =
        measured.reason === "end-before-start"
          ? "Ending odometer is lower than the start."
          : measured.reason === "absurd-jump"
            ? "That odometer jump is larger than 2,000 km for one trip."
            : "Odometer readings are not valid."
      return {
        kilometres: entered,
        source: entered === null ? "missing" : "entered",
        warning: null,
        rejected,
      }
    }
    if (entered !== null && Math.abs(measured.kilometres - entered) > MATERIAL_KM_GAP) {
      return {
        kilometres: measured.kilometres,
        source: "odometer",
        warning: `Odometer difference is ${measured.kilometres} km. The typed ${entered} km disagrees, so the odometer difference is used.`,
        rejected: null,
      }
    }
    return { kilometres: measured.kilometres, source: "odometer", warning: null, rejected: null }
  }

  if (entered !== null) {
    return { kilometres: entered, source: "entered", warning: null, rejected: null }
  }
  return {
    kilometres: null,
    source: "missing",
    warning: null,
    rejected: null,
  }
}

export type SpanRecord = {
  id: string
  vehicleId: string | null
  date: string
  startOdometer: number | null
  endOdometer: number | null
  /** Set on a mileage entry that classifies a shift, or on any second record for that shift. */
  shiftId: string | null
  isShift: boolean
  overlapAcknowledged: boolean
  businessKm: number
  recordedKm: number
}

export type OverlapHit = {
  otherId: string
  reason: "odometer-span" | "shift-link"
}

/** Half-open intervals. A trip that ends where the next starts is not an overlap. */
export function odometerSpansOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  if (aEnd <= aStart || bEnd <= bStart) return false
  return aStart < bEnd && bStart < aEnd
}

/**
 * Same vehicle and overlapping odometer intervals, or two records tied to the same shift.
 * Different vehicles never overlap. Touching endpoints do not overlap.
 */
export function findOverlaps(candidate: SpanRecord, others: SpanRecord[]): OverlapHit[] {
  const hits: OverlapHit[] = []
  for (const other of others) {
    if (other.id === candidate.id) continue
    const sameVehicle =
      candidate.vehicleId !== null &&
      other.vehicleId !== null &&
      candidate.vehicleId === other.vehicleId
    if (
      sameVehicle &&
      candidate.startOdometer !== null &&
      candidate.endOdometer !== null &&
      other.startOdometer !== null &&
      other.endOdometer !== null &&
      odometerSpansOverlap(
        candidate.startOdometer,
        candidate.endOdometer,
        other.startOdometer,
        other.endOdometer,
      )
    ) {
      hits.push({ otherId: other.id, reason: "odometer-span" })
      continue
    }
    const linked =
      (candidate.shiftId !== null &&
        (candidate.shiftId === other.shiftId || candidate.shiftId === other.id)) ||
      (candidate.isShift && other.shiftId === candidate.id)
    if (linked) hits.push({ otherId: other.id, reason: "shift-link" })
  }
  return hits
}

export type OverlapExclusion = {
  id: string
  otherId: string
  reason: "odometer-span" | "shift-link"
}

/**
 * Earlier records are kept. A later overlapping record is left out of the total
 * until overlapAcknowledged is set. Acknowledging includes both, which the report warns about.
 */
export function applyOverlapPolicy(records: SpanRecord[]): {
  included: SpanRecord[]
  excluded: OverlapExclusion[]
} {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const included: SpanRecord[] = []
  const excluded: OverlapExclusion[] = []
  for (const record of sorted) {
    const hits = findOverlaps(record, included)
    if (hits.length > 0 && !record.overlapAcknowledged) {
      excluded.push({ id: record.id, otherId: hits[0].otherId, reason: hits[0].reason })
      continue
    }
    included.push(record)
  }
  return { included, excluded }
}

export function businessKilometresAfterOverlap(records: SpanRecord[]): number {
  const { included } = applyOverlapPolicy(records)
  return roundKm(included.reduce((sum, record) => sum + record.businessKm, 0))
}

export function claimOf(value: unknown): ClaimStatus {
  if (value === "claimed" || value === "not-claimed" || value === "unreviewed") return value
  return "unreviewed"
}

export function purposeOf(value: unknown): TripPurpose {
  if (value === "business" || value === "personal" || value === "mixed" || value === "unclassified") {
    return value
  }
  return "unclassified"
}

export function platformOf(shift: Pick<Shift, "platform">, fallback = DEFAULT_PLATFORM): string {
  const value = shift.platform?.trim()
  return value ? value : fallback
}

export function inCalendarYear(date: string, year: number): boolean {
  return date >= `${year}-01-01` && date <= `${year}-12-31`
}

export function normalizeMerchant(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

export type DuplicateCandidate = {
  id: string
  date: string
  total: number
  merchant: string
  imageHash: string | null
}

export type DuplicateHit = {
  id: string
  reason: "image-hash" | "date-total-merchant"
}

/** Same image hash, or the same purchase date, total, and merchant. The candidate's own id is ignored. */
export function findDuplicateExpenses(
  candidate: DuplicateCandidate,
  existing: DuplicateCandidate[],
): DuplicateHit[] {
  const hits: DuplicateHit[] = []
  const merchant = normalizeMerchant(candidate.merchant)
  for (const other of existing) {
    if (other.id === candidate.id) continue
    if (candidate.imageHash && other.imageHash && candidate.imageHash === other.imageHash) {
      hits.push({ id: other.id, reason: "image-hash" })
      continue
    }
    const otherMerchant = normalizeMerchant(other.merchant)
    const sameTotal = Math.abs(candidate.total - other.total) < 0.005
    if (candidate.date === other.date && sameTotal && merchant.length > 0 && merchant === otherMerchant) {
      hits.push({ id: other.id, reason: "date-total-merchant" })
    }
  }
  return hits
}

export function vehicleLabel(vehicle: Pick<Vehicle, "nickname" | "year" | "make" | "model">): string {
  const nickname = vehicle.nickname.trim()
  const base = [vehicle.year, vehicle.make.trim(), vehicle.model.trim()].filter((part) => part !== "" && part !== null).join(" ")
  if (nickname && base) return `${nickname} · ${base}`
  return nickname || base || "Vehicle"
}

type PurposeSplit = {
  businessKm: number
  personalKm: number
  unclassifiedKm: number
}

export function splitPurposeKm(input: {
  purpose: TripPurpose
  recordedKm: number
  businessKilometres: number | null
}): PurposeSplit {
  const km = roundKm(Math.max(0, input.recordedKm))
  if (input.purpose === "business") return { businessKm: km, personalKm: 0, unclassifiedKm: 0 }
  if (input.purpose === "personal") return { businessKm: 0, personalKm: km, unclassifiedKm: 0 }
  if (input.purpose === "mixed") {
    const portion = input.businessKilometres
    if (portion === null || portion < 0 || portion > km) {
      return { businessKm: 0, personalKm: 0, unclassifiedKm: km }
    }
    const businessKm = roundKm(portion)
    return { businessKm, personalKm: roundKm(km - businessKm), unclassifiedKm: 0 }
  }
  return { businessKm: 0, personalKm: 0, unclassifiedKm: km }
}

export type BusinessUseResult =
  | {
      available: true
      method: "odometer-bookends" | "classified-full-year" | "mixed"
      percentage: number
      numeratorKm: number
      denominatorKm: number
      explanation: string
    }
  | { available: false; reason: string }

type ReadingPoint = { date: string; kilometres: number }

function closestOpening(points: ReadingPoint[], yearStart: string): ReadingPoint | null {
  const eligible = points.filter((point) => point.date <= yearStart)
  eligible.sort((a, b) => b.date.localeCompare(a.date) || b.kilometres - a.kilometres)
  return eligible[0] ?? null
}

function closestClosing(points: ReadingPoint[], yearEnd: string): ReadingPoint | null {
  const eligible = points.filter((point) => point.date >= yearEnd)
  eligible.sort((a, b) => a.date.localeCompare(b.date) || b.kilometres - a.kilometres)
  return eligible[0] ?? null
}

/**
 * Business-use percentage needs a complete denominator.
 * Odometer bookends are a reading on or before 1 January and one on or after 31 December.
 * Otherwise the user can mark classified business + personal kilometres as the full year.
 * Personal kilometres are never invented as "the rest" of a span.
 */
export function businessUseForVehicle(input: {
  vehicle: Vehicle
  readings: OdometerReading[]
  year: number
  businessKm: number
  personalKm: number
  unclassifiedKm: number
  fullYearLogged: boolean
}): BusinessUseResult {
  const yearStart = `${input.year}-01-01`
  const yearEnd = `${input.year}-12-31`
  const points: ReadingPoint[] = input.readings
    .filter((reading) => reading.vehicleId === input.vehicle.id)
    .map((reading) => ({ date: reading.date, kilometres: reading.kilometres }))
  if (input.vehicle.initialOdometer !== null && input.vehicle.initialOdometerDate) {
    points.push({ date: input.vehicle.initialOdometerDate, kilometres: input.vehicle.initialOdometer })
  }
  const opening = closestOpening(points, yearStart)
  const closing = closestClosing(points, yearEnd)
  if (opening && closing) {
    if (closing.kilometres <= opening.kilometres) {
      return {
        available: false,
        reason: `Business-use percentage is unavailable for ${input.year}. ${vehicleLabel(input.vehicle)} has readings around the year, but the later odometer is not higher than the earlier one, so there is no span to divide by. Personal kilometres are not filled in as the remainder.`,
      }
    }
    const denominatorKm = roundKm(closing.kilometres - opening.kilometres)
    const numeratorKm = roundKm(input.businessKm)
    return {
      available: true,
      method: "odometer-bookends",
      percentage: Math.round((numeratorKm / denominatorKm) * 1000) / 10,
      numeratorKm,
      denominatorKm,
      explanation: `Classified business kilometres divided by the odometer span from ${opening.kilometres.toLocaleString("en-CA")} km on or before ${yearStart} to ${closing.kilometres.toLocaleString("en-CA")} km on or after ${yearEnd}. Personal kilometres are only trips you marked personal.`,
    }
  }

  if (!input.fullYearLogged) {
    return {
      available: false,
      reason: `Business-use percentage is unavailable for ${input.year}. ${vehicleLabel(input.vehicle)} has no odometer reading on or before 1 January and another on or after 31 December. Personal kilometres are not filled in as the remainder.`,
    }
  }
  if (input.unclassifiedKm > 0) {
    return {
      available: false,
      reason: `Business-use percentage is unavailable for ${input.year}. Some kilometres on ${vehicleLabel(input.vehicle)} are still unclassified, so the classified log is not a complete year.`,
    }
  }
  const denominatorKm = roundKm(input.businessKm + input.personalKm)
  if (denominatorKm <= 0) {
    return {
      available: false,
      reason: `Business-use percentage is unavailable for ${input.year}. ${vehicleLabel(input.vehicle)} has no classified kilometres.`,
    }
  }
  return {
    available: true,
    method: "classified-full-year",
    percentage: Math.round((input.businessKm / denominatorKm) * 1000) / 10,
    numeratorKm: roundKm(input.businessKm),
    denominatorKm,
    explanation: `You marked ${input.year} as fully classified for ${vehicleLabel(input.vehicle)}. The denominator is business plus personal kilometres you entered, not an odometer span.`,
  }
}

export type TaxTrip = SpanRecord & {
  kind: "shift" | "mileage"
  label: string
  purpose: TripPurpose
  personalKm: number
  unclassifiedKm: number
  distanceSource: DistanceSource
  distanceWarning: string | null
  platform: string
  description: string
  note: string
  evidenceId: string | null
  included: boolean
  exclusion: OverlapExclusion | null
}

export type CategoryTotal = {
  id: VehicleExpenseCategory
  label: string
  cash: number
  claimed: number
  unreviewed: number
  notClaimed: number
}

export type ReceiptIndexRow = {
  id: string
  filename: string
  date: string
  merchant: string
  total: number
  currency: string
  imageSaved: boolean
}

export type FuelAccount = {
  /** Cash paid for fuel, by purchase date. Ledger fill-ups plus fuel expenses, de-duplicated. */
  cash: number
  litresPurchased: number
  /** recorded km × L/100 km. Not a receipt. */
  consumedLitres: number | null
  /** consumed litres × pump price. Not subtracted together with cash. */
  consumedCost: number | null
  rateLabel: string
  note: string
}

export type AnnualSummary = {
  year: number
  vehicleId: string | null
  grossDeliveryIncome: number
  recordedKilometres: number
  businessKilometres: number
  personalKilometres: number
  unclassifiedKilometres: number
  trips: TaxTrip[]
  businessUse: BusinessUseResult
  businessUseByVehicle: { vehicleId: string; name: string; result: BusinessUseResult }[]
  expensesByCategory: CategoryTotal[]
  /** Sum of amounts the user marked claimed. Excludes unreviewed, not claimed, wear, and fuel-consumed estimates. */
  claimedTotal: number
  unreviewedTotal: number
  notClaimedTotal: number
  /** All recorded vehicle cash in the year, including unreviewed fuel. Not a deduction. */
  cashExpenseTotal: number
  maintenanceCash: number
  fuel: FuelAccount
  wear: {
    rate: number | null
    kilometres: number
    baseLabel: string
    cost: number | null
  }
  operating: {
    cash: number
    wear: number | null
    total: number | null
    perKm: number | null
    perKmBaseLabel: string
  }
  warnings: string[]
  receiptIndex: ReceiptIndexRow[]
  nonCadCount: number
}

type BuiltTrip = Omit<TaxTrip, "included" | "exclusion">

function vehicleMatch(id: string | null, filter: string | null): boolean {
  if (filter === null) return true
  return id === filter
}

function tripFromResolved(input: {
  id: string
  date: string
  vehicleId: string | null
  startOdometer: number | null
  endOdometer: number | null
  enteredKilometres: number
  purpose: TripPurpose
  businessKilometres: number | null
  shiftId: string | null
  isShift: boolean
  overlapAcknowledged: boolean
  kind: "shift" | "mileage"
  label: string
  platform: string
  description: string
  note: string
  evidenceId: string | null
}): BuiltTrip {
  const resolved = resolveTripKilometres({
    startOdometer: input.startOdometer,
    endOdometer: input.endOdometer,
    enteredKilometres: input.enteredKilometres,
  })
  const recordedKm = resolved.kilometres ?? 0
  const split = splitPurposeKm({
    purpose: input.purpose,
    recordedKm: resolved.source === "missing" ? 0 : recordedKm,
    businessKilometres: input.businessKilometres,
  })
  let distanceWarning = resolved.warning
  if (resolved.rejected) {
    distanceWarning = resolved.rejected
      ? `${resolved.rejected} The typed kilometres stay labeled as entered.`
      : resolved.warning
  }
  if (input.purpose === "mixed" && split.unclassifiedKm > 0 && recordedKm > 0) {
    const mixed = "Mixed trip is missing a business portion, so these kilometres stay unclassified."
    distanceWarning = distanceWarning ? `${distanceWarning} ${mixed}` : mixed
  }
  return {
    id: input.id,
    vehicleId: input.vehicleId,
    date: input.date,
    startOdometer: input.startOdometer,
    endOdometer: input.endOdometer,
    shiftId: input.shiftId,
    isShift: input.isShift,
    overlapAcknowledged: input.overlapAcknowledged,
    businessKm: split.businessKm,
    recordedKm: resolved.source === "missing" ? 0 : recordedKm,
    kind: input.kind,
    label: input.label,
    purpose: split.unclassifiedKm > 0 && input.purpose === "mixed" ? "unclassified" : input.purpose,
    personalKm: split.personalKm,
    unclassifiedKm: split.unclassifiedKm,
    distanceSource: resolved.source,
    distanceWarning,
    platform: input.platform,
    description: input.description,
    note: input.note,
    evidenceId: input.evidenceId,
  }
}

function collectTrips(
  shifts: Shift[],
  mileage: MileageEntry[],
  year: number,
  vehicleFilter: string | null,
  defaultPlatform: string,
): BuiltTrip[] {
  const yearShifts = shifts.filter(
    (shift) => inCalendarYear(shift.date, year) && vehicleMatch(shift.vehicleId ?? null, vehicleFilter),
  )
  const yearMileage = mileage.filter(
    (entry) => inCalendarYear(entry.date, year) && vehicleMatch(entry.vehicleId, vehicleFilter),
  )
  const consumed = new Set<string>()
  const trips: BuiltTrip[] = []

  for (const shift of yearShifts) {
    const linked = yearMileage
      .filter((entry) => entry.shiftId === shift.id)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    if (linked.length === 0) {
      trips.push(
        tripFromResolved({
          id: shift.id,
          date: shift.date,
          vehicleId: shift.vehicleId ?? null,
          startOdometer: shift.startOdometer ?? null,
          endOdometer: shift.endOdometer ?? null,
          enteredKilometres: shift.kilometres,
          purpose: purposeOf(shift.purpose),
          businessKilometres: shift.businessKilometres ?? null,
          shiftId: null,
          isShift: true,
          overlapAcknowledged: shift.overlapAcknowledged === true,
          kind: "shift",
          label: shift.area.trim() || platformOf(shift, defaultPlatform),
          platform: platformOf(shift, defaultPlatform),
          description: shift.businessPurpose?.trim() || shift.area.trim(),
          note: shift.note,
          evidenceId: shift.evidenceId ?? null,
        }),
      )
      continue
    }
    // The linked mileage entry is the tax record for this shift. The shift is not also added,
    // so the same trip cannot be counted twice. Extra links remain and the overlap policy drops them
    // unless the user acknowledged the duplicate.
    for (const entry of linked) {
      consumed.add(entry.id)
      trips.push(
        tripFromResolved({
          id: entry.id,
          date: entry.date,
          vehicleId: entry.vehicleId ?? shift.vehicleId ?? null,
          startOdometer: entry.startOdometer ?? shift.startOdometer ?? null,
          endOdometer: entry.endOdometer ?? shift.endOdometer ?? null,
          enteredKilometres: entry.kilometres > 0 ? entry.kilometres : shift.kilometres,
          purpose: entry.purpose,
          businessKilometres: entry.businessKilometres,
          shiftId: shift.id,
          isShift: false,
          overlapAcknowledged: entry.overlapAcknowledged,
          kind: "mileage",
          label: entry.description.trim() || `Tax log for shift ${shift.date}`,
          platform: platformOf(shift, defaultPlatform),
          description: entry.description,
          note: entry.note || shift.note,
          evidenceId: entry.evidenceId,
        }),
      )
    }
  }

  for (const entry of yearMileage) {
    if (consumed.has(entry.id)) continue
    const linkedShift = entry.shiftId ? shifts.find((shift) => shift.id === entry.shiftId) : undefined
    trips.push(
      tripFromResolved({
        id: entry.id,
        date: entry.date,
        vehicleId: entry.vehicleId,
        startOdometer: entry.startOdometer,
        endOdometer: entry.endOdometer,
        enteredKilometres: entry.kilometres,
        purpose: entry.purpose,
        businessKilometres: entry.businessKilometres,
        shiftId: entry.shiftId,
        isShift: false,
        overlapAcknowledged: entry.overlapAcknowledged,
        kind: "mileage",
        label: entry.description.trim() || "Mileage entry",
        platform: linkedShift ? platformOf(linkedShift, defaultPlatform) : "",
        description: entry.description,
        note: entry.note,
        evidenceId: entry.evidenceId,
      }),
    )
  }

  return trips
}

type MoneyRow = {
  id: string
  date: string
  total: number
  currency: string
  category: VehicleExpenseCategory
  claimStatus: ClaimStatus
  litres: number | null
  merchant: string
  source: "expense" | "fill"
  imageName: string
  imageSaved: boolean
  vehicleId: string | null
}

/**
 * Fuel cash uses the purchase date.
 * An expense that points at a fill-up replaces that fill so the receipt is not added twice.
 * Fill-ups with no vehicle stay in the all-vehicles view. A single-vehicle filter includes them
 * only when the ledger has that one vehicle, because older fill-ups were not tagged.
 */
function moneyRows(
  expenses: VehicleExpense[],
  fuel: FuelFill[],
  year: number,
  vehicleFilter: string | null,
  vehicleCount: number,
): MoneyRow[] {
  const linkedFills = new Set(
    expenses.flatMap((expense) => (expense.fuelFillId ? [expense.fuelFillId] : [])),
  )
  const rows: MoneyRow[] = []
  for (const expense of expenses) {
    if (!inCalendarYear(expense.date, year)) continue
    if (!vehicleMatch(expense.vehicleId, vehicleFilter)) continue
    rows.push({
      id: expense.id,
      date: expense.date,
      total: expense.total,
      currency: expense.currency || "CAD",
      category: expense.category,
      claimStatus: expense.claimStatus,
      litres: expense.litres,
      merchant: expense.merchant,
      source: "expense",
      imageName: expense.imageName,
      imageSaved: expense.imageSaved,
      vehicleId: expense.vehicleId,
    })
  }
  const includeUntaggedFills = vehicleFilter === null || vehicleCount <= 1
  if (includeUntaggedFills) {
    for (const fill of fuel) {
      if (!inCalendarYear(fill.date, year) || linkedFills.has(fill.id)) continue
      rows.push({
        id: fill.id,
        date: fill.date,
        total: fill.total,
        currency: "CAD",
        category: "fuel",
        claimStatus: claimOf(fill.claimStatus),
        litres: fill.litres,
        merchant: fill.station,
        source: "fill",
        imageName: "",
        imageSaved: false,
        vehicleId: null,
      })
    }
  }
  return rows
}

function cadAmount(row: MoneyRow): number | null {
  return row.currency.toUpperCase() === "CAD" ? row.total : null
}

function sumClaim(rows: MoneyRow[], status: ClaimStatus): number {
  return roundMoney(
    rows.reduce((sum, row) => {
      const amount = cadAmount(row)
      if (amount === null || row.claimStatus !== status) return sum
      return sum + amount
    }, 0),
  )
}

function emptyCategories(): CategoryTotal[] {
  return VEHICLE_EXPENSE_CATEGORIES.map((category) => ({
    id: category.id,
    label: category.label,
    cash: 0,
    claimed: 0,
    unreviewed: 0,
    notClaimed: 0,
  }))
}

function consumptionRate(
  settings: Settings,
  vehicles: Vehicle[],
  vehicleFilter: string | null,
): { litresPer100km: number | null; price: number | null; rateLabel: string } {
  const selected = vehicleFilter ? vehicles.find((vehicle) => vehicle.id === vehicleFilter) : null
  if (selected?.litresPer100km !== null && selected?.litresPer100km !== undefined && selected.litresPer100km > 0) {
    return {
      litresPer100km: selected.litresPer100km,
      price: settings.fuelPricePerLitre,
      rateLabel: `${selected.litresPer100km} L/100 km on ${vehicleLabel(selected)}`,
    }
  }
  if (settings.litresPer100km !== null && settings.litresPer100km > 0) {
    return {
      litresPer100km: settings.litresPer100km,
      price: settings.fuelPricePerLitre,
      rateLabel: `${settings.litresPer100km} L/100 km from Settings`,
    }
  }
  return { litresPer100km: null, price: settings.fuelPricePerLitre, rateLabel: "No L/100 km saved" }
}

function wearRate(vehicles: Vehicle[], vehicleFilter: string | null): number | null {
  const pool = vehicleFilter ? vehicles.filter((vehicle) => vehicle.id === vehicleFilter) : vehicles
  const rates = pool.map((vehicle) => vehicle.wearPerKm).filter((rate): rate is number => rate !== null && rate > 0)
  if (rates.length === 0) return null
  if (vehicleFilter) return rates[0]
  const first = rates[0]
  if (rates.every((rate) => rate === first)) return first
  return null
}

export function buildAnnualSummary(input: {
  year: number
  shifts: Shift[]
  fuel: FuelFill[]
  mileage: MileageEntry[]
  expenses: VehicleExpense[]
  vehicles: Vehicle[]
  readings: OdometerReading[]
  yearCoverage: YearCoverage[]
  settings: Settings
  vehicleId?: string | null
}): AnnualSummary {
  const vehicleFilter = input.vehicleId ?? null
  const defaultPlatform = input.settings.defaultPlatform || DEFAULT_PLATFORM
  const built = collectTrips(input.shifts, input.mileage, input.year, vehicleFilter, defaultPlatform)
  const policy = applyOverlapPolicy(built)
  const excludedById = new Map(policy.excluded.map((item) => [item.id, item]))
  const trips: TaxTrip[] = built
    .map((trip) => ({
      ...trip,
      included: !excludedById.has(trip.id),
      exclusion: excludedById.get(trip.id) ?? null,
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
  const included = trips.filter((trip) => trip.included)

  const recordedKilometres = roundKm(included.reduce((sum, trip) => sum + trip.recordedKm, 0))
  const businessKilometres = roundKm(included.reduce((sum, trip) => sum + trip.businessKm, 0))
  const personalKilometres = roundKm(included.reduce((sum, trip) => sum + trip.personalKm, 0))
  const unclassifiedKilometres = roundKm(included.reduce((sum, trip) => sum + trip.unclassifiedKm, 0))

  const grossDeliveryIncome = roundMoney(
    input.shifts
      .filter((shift) => inCalendarYear(shift.date, input.year) && vehicleMatch(shift.vehicleId ?? null, vehicleFilter))
      .reduce((sum, shift) => sum + shift.earnings, 0),
  )

  const activeVehicleIds = new Set<string>()
  for (const trip of included) {
    if (trip.vehicleId) activeVehicleIds.add(trip.vehicleId)
  }
  for (const reading of input.readings) {
    if (inCalendarYear(reading.date, input.year) || reading.date <= `${input.year}-01-01` || reading.date >= `${input.year}-12-31`) {
      if (vehicleFilter === null || reading.vehicleId === vehicleFilter) activeVehicleIds.add(reading.vehicleId)
    }
  }
  const vehiclesForUse = input.vehicles.filter((vehicle) => {
    if (vehicleFilter !== null) return vehicle.id === vehicleFilter
    if (input.vehicles.length === 1) return true
    return activeVehicleIds.has(vehicle.id)
  })

  const businessUseByVehicle = vehiclesForUse.map((vehicle) => {
    const own = included.filter((trip) => trip.vehicleId === vehicle.id)
    const coverage = input.yearCoverage.find((item) => item.vehicleId === vehicle.id && item.year === input.year)
    return {
      vehicleId: vehicle.id,
      name: vehicleLabel(vehicle),
      result: businessUseForVehicle({
        vehicle,
        readings: input.readings,
        year: input.year,
        businessKm: own.reduce((sum, trip) => sum + trip.businessKm, 0),
        personalKm: own.reduce((sum, trip) => sum + trip.personalKm, 0),
        unclassifiedKm: own.reduce((sum, trip) => sum + trip.unclassifiedKm, 0),
        fullYearLogged: coverage?.fullYearLogged === true,
      }),
    }
  })

  const availableUses = businessUseByVehicle.flatMap((item) => (item.result.available ? [item.result] : []))
  let businessUse: BusinessUseResult
  if (vehiclesForUse.length === 0) {
    businessUse = {
      available: false,
      reason: `Business-use percentage is unavailable for ${input.year}. Add a vehicle and an odometer reading on or before 1 January and another on or after 31 December. Kilometres without a vehicle cannot supply those bookends. Personal kilometres are not estimated.`,
    }
  } else if (availableUses.length === businessUseByVehicle.length && availableUses.length > 0) {
    const numeratorKm = roundKm(availableUses.reduce((sum, item) => sum + item.numeratorKm, 0))
    const denominatorKm = roundKm(availableUses.reduce((sum, item) => sum + item.denominatorKm, 0))
    const methods = new Set(availableUses.map((item) => item.method))
    const method = methods.size === 1 ? availableUses[0].method : "mixed"
    businessUse =
      denominatorKm > 0
        ? {
            available: true,
            method,
            percentage: Math.round((numeratorKm / denominatorKm) * 1000) / 10,
            numeratorKm,
            denominatorKm,
            explanation: availableUses.map((item) => item.explanation).join(" "),
          }
        : {
            available: false,
            reason: `Business-use percentage is unavailable for ${input.year}. The denominator is zero.`,
          }
  } else {
    businessUse = {
      available: false,
      reason: businessUseByVehicle
        .flatMap((item) => (item.result.available ? [] : [item.result.reason]))
        .join(" "),
    }
  }

  const rows = moneyRows(input.expenses, input.fuel, input.year, vehicleFilter, input.vehicles.length)
  const cadRows = rows.filter((row) => cadAmount(row) !== null)
  const categories = emptyCategories()
  for (const row of cadRows) {
    const category = categories.find((item) => item.id === row.category)
    if (!category) continue
    const amount = row.total
    category.cash = roundMoney(category.cash + amount)
    if (row.claimStatus === "claimed") category.claimed = roundMoney(category.claimed + amount)
    else if (row.claimStatus === "not-claimed") category.notClaimed = roundMoney(category.notClaimed + amount)
    else category.unreviewed = roundMoney(category.unreviewed + amount)
  }
  const claimedTotal = sumClaim(rows, "claimed")
  const unreviewedTotal = sumClaim(rows, "unreviewed")
  const notClaimedTotal = sumClaim(rows, "not-claimed")
  const cashExpenseTotal = roundMoney(cadRows.reduce((sum, row) => sum + row.total, 0))
  const maintenanceCash = categories.find((category) => category.id === "maintenance")?.cash ?? 0
  const nonCadCount = rows.filter((row) => cadAmount(row) === null).length

  const fuelRows = cadRows.filter((row) => row.category === "fuel")
  const fuelCash = roundMoney(fuelRows.reduce((sum, row) => sum + row.total, 0))
  const litresPurchased = roundMoney(
    fuelRows.reduce((sum, row) => sum + (row.litres !== null && row.litres > 0 ? row.litres : 0), 0),
  )
  const rate = consumptionRate(input.settings, input.vehicles, vehicleFilter)
  const consumedLitres =
    rate.litresPer100km !== null && recordedKilometres > 0
      ? Math.round(recordedKilometres * (rate.litresPer100km / 100) * 100) / 100
      : null
  const consumedCost =
    consumedLitres !== null && rate.price !== null && rate.price > 0
      ? roundMoney(consumedLitres * rate.price)
      : null

  const classifiedBusiness = businessKilometres > 0
  const wearKm = classifiedBusiness ? businessKilometres : recordedKilometres
  const wearBaseLabel = classifiedBusiness
    ? "classified business kilometres"
    : "recorded kilometres, because no trip is classified as business"
  const ratePerKm = wearRate(input.vehicles, vehicleFilter)
  let wearCost: number | null = null
  let wearLabel = wearBaseLabel
  if (vehicleFilter === null && input.vehicles.filter((vehicle) => vehicle.wearPerKm !== null && vehicle.wearPerKm > 0).length > 1) {
    const distinct = new Set(input.vehicles.map((vehicle) => vehicle.wearPerKm).filter((value) => value !== null))
    if (distinct.size > 1) {
      wearLabel = "not combined, because vehicles use different wear rates"
      wearCost = null
    }
  }
  if (ratePerKm !== null && wearKm > 0 && !wearLabel.startsWith("not combined")) {
    wearCost = roundMoney(ratePerKm * wearKm)
  }
  const operatingTotal = wearCost === null ? null : roundMoney(cashExpenseTotal + wearCost)
  const perKm =
    operatingTotal !== null && wearKm > 0 ? roundMoney(operatingTotal / wearKm) : null

  const warnings: string[] = []
  if (unclassifiedKilometres > 0) {
    warnings.push(
      `${unclassifiedKilometres} km are unclassified. They are missing for tax purposes and are not counted as business kilometres.`,
    )
  }
  const missingOdometer = included.filter(
    (trip) => trip.recordedKm > 0 && (trip.startOdometer === null || trip.endOdometer === null),
  ).length
  if (missingOdometer > 0) {
    warnings.push(`${missingOdometer} trip${missingOdometer === 1 ? "" : "s"} with kilometres ${missingOdometer === 1 ? "has" : "have"} no start and end odometer.`)
  }
  const rejected = included.filter((trip) => trip.distanceWarning).length
  if (rejected > 0) {
    warnings.push(`${rejected} trip${rejected === 1 ? "" : "s"} ${rejected === 1 ? "has" : "have"} a distance warning. Check the mileage log.`)
  }
  if (policy.excluded.length > 0) {
    warnings.push(
      `${policy.excluded.length} overlapping record${policy.excluded.length === 1 ? "" : "s"} ${policy.excluded.length === 1 ? "was" : "were"} left out of the annual kilometre totals. Acknowledge an overlap only if both records should count.`,
    )
  }
  const acknowledged = included.filter((trip) => trip.overlapAcknowledged && findOverlaps(trip, included).length > 0)
  if (acknowledged.length > 0) {
    warnings.push(
      `${acknowledged.length} record${acknowledged.length === 1 ? "" : "s"} overlap another included record and ${acknowledged.length === 1 ? "was" : "were"} kept because you acknowledged ${acknowledged.length === 1 ? "it" : "them"}.`,
    )
  }
  if (!businessUse.available) warnings.push(businessUse.reason)
  if (businessUse.available && businessUse.numeratorKm > businessUse.denominatorKm) {
    warnings.push("Classified business kilometres are larger than the business-use denominator. Check for missing odometer span or double-counted trips.")
  }
  const fuelWithoutPhoto = fuelRows.filter((row) => row.source === "fill" || !row.imageSaved).length
  if (fuelWithoutPhoto > 0) {
    warnings.push(
      `${fuelWithoutPhoto} fuel purchase${fuelWithoutPhoto === 1 ? "" : "s"} ${fuelWithoutPhoto === 1 ? "has" : "have"} no receipt photo stored in this browser.`,
    )
  }
  const failedImages = input.expenses.filter(
    (expense) => inCalendarYear(expense.date, input.year) && expense.imageId && !expense.imageSaved,
  ).length
  if (failedImages > 0) {
    warnings.push(`${failedImages} receipt photo${failedImages === 1 ? "" : "s"} did not save. The amounts are kept only if you entered them.`)
  }
  if (consumedCost !== null && consumedLitres !== null) {
    warnings.push(
      `Estimated fuel consumed is ${consumedLitres} L (${rate.rateLabel}). It is not added to cash spent on fuel and is not part of the claimed total.`,
    )
  }
  if (wearCost !== null) {
    warnings.push(
      `Estimated wear-and-tear uses ${wearBaseLabel} and is not included in the claimed total.`,
    )
  }
  const unassignedBusiness = roundKm(
    included.filter((trip) => trip.vehicleId === null).reduce((sum, trip) => sum + trip.businessKm, 0),
  )
  if (unassignedBusiness > 0) {
    warnings.push(
      `${unassignedBusiness} km of classified business driving is not linked to a vehicle, so it is in the business-kilometre total and not in a vehicle business-use percentage.`,
    )
  }
  if (nonCadCount > 0) {
    warnings.push(`${nonCadCount} expense${nonCadCount === 1 ? "" : "s"} not in CAD ${nonCadCount === 1 ? "is" : "are"} left out of the Canadian totals.`)
  }
  if (vehicleFilter !== null && input.vehicles.length > 1) {
    const unassigned = input.fuel.filter((fill) => inCalendarYear(fill.date, input.year)).length
    if (unassigned > 0) {
      warnings.push("Fill-ups from the Fuel page are not tied to one vehicle. They appear in the all-vehicles year, not in this vehicle's fuel cash.")
    }
  }

  const receiptIndex: ReceiptIndexRow[] = input.expenses
    .filter((expense) => inCalendarYear(expense.date, input.year) && vehicleMatch(expense.vehicleId, vehicleFilter))
    .map((expense) => ({
      id: expense.id,
      filename: expense.imageSaved ? expense.imageName || expense.id : expense.imageName || "",
      date: expense.date,
      merchant: expense.merchant,
      total: expense.total,
      currency: expense.currency || "CAD",
      imageSaved: expense.imageSaved,
    }))

  return {
    year: input.year,
    vehicleId: vehicleFilter,
    grossDeliveryIncome,
    recordedKilometres,
    businessKilometres,
    personalKilometres,
    unclassifiedKilometres,
    trips,
    businessUse,
    businessUseByVehicle,
    expensesByCategory: categories,
    claimedTotal,
    unreviewedTotal,
    notClaimedTotal,
    cashExpenseTotal,
    maintenanceCash,
    fuel: {
      cash: fuelCash,
      litresPurchased,
      consumedLitres,
      consumedCost,
      rateLabel: rate.rateLabel,
      note: "Cash spent is the receipt or fill-up total on the purchase date. Estimated fuel consumed is kilometres times L/100 km times the pump price. They are separate. Neither figure is subtracted twice, and consumed fuel is not a claimed expense.",
    },
    wear: {
      rate: wearLabel.startsWith("not combined") ? null : ratePerKm,
      kilometres: wearKm,
      baseLabel: wearLabel,
      cost: wearCost,
    },
    operating: {
      cash: cashExpenseTotal,
      wear: wearCost,
      total: operatingTotal,
      perKm,
      perKmBaseLabel: wearBaseLabel,
    },
    warnings,
    receiptIndex,
    nonCadCount,
  }
}

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value)
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function csvLine(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",")
}

/** Detailed mileage, expenses, and fuel rows for the selected year. Amounts are the stored figures. */
export function annualRecordsCsv(summary: AnnualSummary, input: {
  expenses: VehicleExpense[]
  fuel: FuelFill[]
}): string {
  const lines = [
    csvLine([
      "record_type",
      "id",
      "date",
      "vehicle_id",
      "description",
      "platform",
      "recorded_km",
      "distance_source",
      "purpose",
      "business_km",
      "personal_km",
      "unclassified_km",
      "included_in_annual_km",
      "category",
      "merchant",
      "litres",
      "total",
      "currency",
      "claim_status",
      "image_id",
      "image_saved",
      "note",
    ]),
  ]
  for (const trip of summary.trips) {
    lines.push(
      csvLine([
        trip.kind === "shift" ? "shift" : "mileage",
        trip.id,
        trip.date,
        trip.vehicleId,
        trip.description || trip.label,
        trip.platform,
        trip.recordedKm,
        trip.distanceSource,
        trip.purpose,
        trip.businessKm,
        trip.personalKm,
        trip.unclassifiedKm,
        trip.included ? "yes" : "no",
        "",
        "",
        "",
        "",
        "",
        "",
        trip.evidenceId,
        "",
        trip.note,
      ]),
    )
  }
  for (const expense of input.expenses.filter((item) => inCalendarYear(item.date, summary.year))) {
    if (summary.vehicleId && expense.vehicleId !== summary.vehicleId) continue
    lines.push(
      csvLine([
        "expense",
        expense.id,
        expense.date,
        expense.vehicleId,
        expense.note,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        expense.category,
        expense.merchant,
        expense.litres,
        expense.total,
        expense.currency,
        expense.claimStatus,
        expense.imageSaved ? expense.imageId || expense.imageName : expense.imageName,
        expense.imageSaved ? "yes" : "no",
        expense.fuelFillId ? `linked fill-up ${expense.fuelFillId}` : "",
      ]),
    )
  }
  const linked = new Set(input.expenses.flatMap((expense) => (expense.fuelFillId ? [expense.fuelFillId] : [])))
  for (const fill of input.fuel.filter((item) => inCalendarYear(item.date, summary.year))) {
    lines.push(
      csvLine([
        "fuel_fill",
        fill.id,
        fill.date,
        "",
        linked.has(fill.id) ? "Superseded in fuel cash by a linked expense" : "Ledger fill-up",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "fuel",
        fill.station,
        fill.litres,
        fill.total,
        "CAD",
        claimOf(fill.claimStatus),
        "",
        "no",
        fill.odometer === null ? "" : `odometer ${fill.odometer}`,
      ]),
    )
  }
  return lines.join("\n")
}

export function currentOdometer(readings: OdometerReading[], vehicleId: string): number | null {
  const own = readings.filter((reading) => reading.vehicleId === vehicleId)
  own.sort((a, b) => b.date.localeCompare(a.date) || b.kilometres - a.kilometres)
  return own[0]?.kilometres ?? null
}

export function categoryLabel(id: VehicleExpenseCategory): string {
  return VEHICLE_EXPENSE_CATEGORIES.find((category) => category.id === id)?.label ?? id
}
