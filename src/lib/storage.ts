import { isClock, isISODate } from "@/lib/dates"
import { claimOf, purposeOf } from "@/lib/vehicle"
import {
  BILL_CATEGORIES,
  DEFAULT_PLATFORM,
  EMPTY_LEDGER,
  EMPTY_SETTINGS,
  FUEL_TYPES,
  PROVINCES,
  VEHICLE_EXPENSE_CATEGORIES,
  type Bill,
  type BillCategory,
  type FuelFill,
  type FuelType,
  type MileageEntry,
  type OdometerReading,
  type OdometerSource,
  type Persisted,
  type ProvinceCode,
  type Settings,
  type Shift,
  type Snapshot,
  type TripPurpose,
  type Vehicle,
  type VehicleExpense,
  type VehicleExpenseCategory,
  type YearCoverage,
} from "@/lib/types"

/** Kept as skippilot.ledger.v1 so ledgers saved before the GoVio rename still load. */
export const STORAGE_KEY = "skippilot.ledger.v1"

const PROVINCE_CODES = new Set<string>(PROVINCES.map((province) => province.code))
const CATEGORY_IDS = new Set<string>(BILL_CATEGORIES.map((category) => category.id))
const FUEL_TYPE_IDS = new Set<string>(FUEL_TYPES.map((item) => item.id))
const EXPENSE_CATEGORY_IDS = new Set<string>(VEHICLE_EXPENSE_CATEGORIES.map((item) => item.id))
const ODOMETER_SOURCES = new Set<string>(["profile", "initial", "shift", "mileage", "fuel", "manual"])

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : ""
}

function optionalText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.slice(0, max)
  return trimmed
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function optionalPositive(value: unknown): number | null {
  const number = finiteNumber(value)
  if (number === null || number <= 0) return null
  return number
}

function readSettings(value: unknown): Settings {
  if (!isRecord(value)) return { ...EMPTY_SETTINGS }
  const province = typeof value.province === "string" ? value.province : ""
  const target = finiteNumber(value.weeklyIncomeTarget)
  return {
    displayName:
      typeof value.displayName === "string" ? value.displayName.slice(0, 40) : "",
    province: PROVINCE_CODES.has(province) ? (province as ProvinceCode) : "",
    weeklyIncomeTarget: target !== null && target > 0 ? Math.round(target * 100) / 100 : 0,
    litresPer100km: optionalPositive(value.litresPer100km),
    fuelPricePerLitre: optionalPositive(value.fuelPricePerLitre),
    defaultPlatform: text(value.defaultPlatform, 40).trim() || DEFAULT_PLATFORM,
  }
}

function readShift(value: unknown): Shift | null {
  if (!isRecord(value)) return null
  const earnings = finiteNumber(value.earnings)
  const kilometres = finiteNumber(value.kilometres)
  if (
    typeof value.id !== "string" ||
    typeof value.date !== "string" ||
    !isISODate(value.date) ||
    typeof value.start !== "string" ||
    !isClock(value.start) ||
    typeof value.end !== "string" ||
    !isClock(value.end) ||
    earnings === null ||
    earnings < 0 ||
    kilometres === null ||
    kilometres < 0
  ) {
    return null
  }
  const orders = finiteNumber(value.orders)
  const startOdometer = finiteNumber(value.startOdometer)
  const endOdometer = finiteNumber(value.endOdometer)
  const businessKilometres = finiteNumber(value.businessKilometres)
  const purpose = purposeOf(value.purpose)
  return {
    id: value.id,
    date: value.date,
    start: value.start,
    end: value.end,
    earnings: Math.round(earnings * 100) / 100,
    kilometres: Math.round(kilometres * 10) / 10,
    orders: orders !== null && orders >= 0 ? Math.round(orders) : null,
    area: text(value.area, 60),
    note: text(value.note, 180),
    platform: text(value.platform, 40).trim() || DEFAULT_PLATFORM,
    vehicleId: typeof value.vehicleId === "string" && value.vehicleId ? value.vehicleId : null,
    startOdometer: startOdometer !== null && startOdometer >= 0 ? Math.round(startOdometer) : null,
    endOdometer: endOdometer !== null && endOdometer >= 0 ? Math.round(endOdometer) : null,
    purpose,
    businessKilometres:
      purpose === "mixed" && businessKilometres !== null && businessKilometres >= 0
        ? Math.round(businessKilometres * 10) / 10
        : null,
    businessPurpose: text(value.businessPurpose, 180),
    evidenceId: optionalText(value.evidenceId, 80),
    overlapAcknowledged: value.overlapAcknowledged === true,
  }
}

function readFuel(value: unknown): FuelFill | null {
  if (!isRecord(value)) return null
  const litres = finiteNumber(value.litres)
  const pricePerLitre = finiteNumber(value.pricePerLitre)
  const total = finiteNumber(value.total)
  const odometer = finiteNumber(value.odometer)
  if (
    typeof value.id !== "string" ||
    typeof value.date !== "string" ||
    !isISODate(value.date) ||
    litres === null ||
    litres <= 0 ||
    pricePerLitre === null ||
    pricePerLitre <= 0 ||
    total === null ||
    total < 0
  ) {
    return null
  }
  return {
    id: value.id,
    date: value.date,
    litres: Math.round(litres * 100) / 100,
    pricePerLitre: Math.round(pricePerLitre * 1000) / 1000,
    total: Math.round(total * 100) / 100,
    station: text(value.station, 60),
    odometer: odometer !== null && odometer >= 0 ? Math.round(odometer) : null,
    claimStatus: claimOf(value.claimStatus),
  }
}

function readBill(value: unknown): Bill | null {
  if (!isRecord(value)) return null
  const amount = finiteNumber(value.amount)
  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    value.name.trim() === "" ||
    typeof value.dueDate !== "string" ||
    !isISODate(value.dueDate) ||
    amount === null ||
    amount <= 0 ||
    typeof value.category !== "string" ||
    !CATEGORY_IDS.has(value.category)
  ) {
    return null
  }
  return {
    id: value.id,
    name: value.name.slice(0, 80),
    amount: Math.round(amount * 100) / 100,
    dueDate: value.dueDate,
    category: value.category as BillCategory,
    paid: value.paid === true,
  }
}

function readVehicle(value: unknown): Vehicle | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id) return null
  const year = finiteNumber(value.year)
  const initial = finiteNumber(value.initialOdometer)
  const initialDate = typeof value.initialOdometerDate === "string" ? value.initialOdometerDate : ""
  const fuelType = typeof value.fuelType === "string" ? value.fuelType : ""
  return {
    id: value.id,
    make: text(value.make, 40),
    model: text(value.model, 40),
    year: year !== null && year >= 1980 && year <= 2100 ? Math.round(year) : null,
    nickname: text(value.nickname, 40),
    fuelType: FUEL_TYPE_IDS.has(fuelType) ? (fuelType as FuelType) : "gasoline",
    litresPer100km: optionalPositive(value.litresPer100km),
    wearPerKm: optionalPositive(value.wearPerKm),
    initialOdometer: initial !== null && initial >= 0 ? Math.round(initial) : null,
    initialOdometerDate: isISODate(initialDate) ? initialDate : null,
  }
}

function readReading(value: unknown): OdometerReading | null {
  if (!isRecord(value)) return null
  const kilometres = finiteNumber(value.kilometres)
  const source = typeof value.source === "string" ? value.source : ""
  const role = value.role
  if (
    typeof value.id !== "string" ||
    typeof value.vehicleId !== "string" ||
    typeof value.date !== "string" ||
    !isISODate(value.date) ||
    kilometres === null ||
    kilometres < 0 ||
    !ODOMETER_SOURCES.has(source) ||
    (role !== "start" && role !== "end" && role !== "point")
  ) {
    return null
  }
  return {
    id: value.id,
    vehicleId: value.vehicleId,
    date: value.date,
    kilometres: Math.round(kilometres),
    source: source as OdometerSource,
    sourceId: typeof value.sourceId === "string" ? value.sourceId : null,
    role,
    note: text(value.note, 120),
  }
}

function readMileage(value: unknown): MileageEntry | null {
  if (!isRecord(value)) return null
  const kilometres = finiteNumber(value.kilometres)
  const startOdometer = finiteNumber(value.startOdometer)
  const endOdometer = finiteNumber(value.endOdometer)
  const businessKilometres = finiteNumber(value.businessKilometres)
  if (
    typeof value.id !== "string" ||
    typeof value.date !== "string" ||
    !isISODate(value.date) ||
    kilometres === null ||
    kilometres < 0
  ) {
    return null
  }
  const purpose: TripPurpose = purposeOf(value.purpose)
  return {
    id: value.id,
    vehicleId: typeof value.vehicleId === "string" && value.vehicleId ? value.vehicleId : null,
    date: value.date,
    startOdometer: startOdometer !== null && startOdometer >= 0 ? Math.round(startOdometer) : null,
    endOdometer: endOdometer !== null && endOdometer >= 0 ? Math.round(endOdometer) : null,
    kilometres: Math.round(kilometres * 10) / 10,
    purpose,
    businessKilometres:
      purpose === "mixed" && businessKilometres !== null && businessKilometres >= 0
        ? Math.round(businessKilometres * 10) / 10
        : null,
    description: text(value.description, 180),
    note: text(value.note, 180),
    evidenceId: optionalText(value.evidenceId, 80),
    shiftId: typeof value.shiftId === "string" && value.shiftId ? value.shiftId : null,
    overlapAcknowledged: value.overlapAcknowledged === true,
  }
}

function readExpense(value: unknown): VehicleExpense | null {
  if (!isRecord(value)) return null
  const total = finiteNumber(value.total)
  const category = typeof value.category === "string" ? value.category : ""
  if (
    typeof value.id !== "string" ||
    typeof value.date !== "string" ||
    !isISODate(value.date) ||
    total === null ||
    total < 0 ||
    !EXPENSE_CATEGORY_IDS.has(category)
  ) {
    return null
  }
  const litres = finiteNumber(value.litres)
  const pricePerLitre = finiteNumber(value.pricePerLitre)
  const subtotal = finiteNumber(value.subtotal)
  const tax = finiteNumber(value.tax)
  const currency = text(value.currency, 3).toUpperCase() || "CAD"
  return {
    id: value.id,
    vehicleId: typeof value.vehicleId === "string" && value.vehicleId ? value.vehicleId : null,
    category: category as VehicleExpenseCategory,
    merchant: text(value.merchant, 80),
    date: value.date,
    fuelType: text(value.fuelType, 40),
    litres: litres !== null && litres > 0 ? Math.round(litres * 100) / 100 : null,
    pricePerLitre: pricePerLitre !== null && pricePerLitre > 0 ? Math.round(pricePerLitre * 1000) / 1000 : null,
    subtotal: subtotal !== null && subtotal >= 0 ? Math.round(subtotal * 100) / 100 : null,
    tax: tax !== null && tax >= 0 ? Math.round(tax * 100) / 100 : null,
    total: Math.round(total * 100) / 100,
    currency,
    claimStatus: claimOf(value.claimStatus),
    note: text(value.note, 180),
    imageId: typeof value.imageId === "string" && value.imageId ? value.imageId : null,
    imageName: text(value.imageName, 120),
    imageHash: typeof value.imageHash === "string" && value.imageHash ? value.imageHash.slice(0, 128) : null,
    imageSaved: value.imageSaved === true,
    fuelFillId: typeof value.fuelFillId === "string" && value.fuelFillId ? value.fuelFillId : null,
    uploadedAt: typeof value.uploadedAt === "string" && isISODate(value.uploadedAt) ? value.uploadedAt : null,
    duplicateAcknowledged: value.duplicateAcknowledged === true,
  }
}

function readCoverage(value: unknown): YearCoverage | null {
  if (!isRecord(value)) return null
  const year = finiteNumber(value.year)
  if (typeof value.vehicleId !== "string" || !value.vehicleId || year === null) return null
  const rounded = Math.round(year)
  if (rounded < 2000 || rounded > 2100) return null
  return { vehicleId: value.vehicleId, year: rounded, fullYearLogged: value.fullYearLogged === true }
}

function readList<T>(value: unknown, read: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const parsed = read(item)
    return parsed ? [parsed] : []
  })
}

function readSnapshot(value: unknown): Snapshot | null {
  if (!isRecord(value)) return null
  const shifts = Array.isArray(value.shifts)
    ? value.shifts.flatMap((item) => {
        const shift = readShift(item)
        return shift ? [shift] : []
      })
    : []
  const fuel = Array.isArray(value.fuel)
    ? value.fuel.flatMap((item) => {
        const fill = readFuel(item)
        return fill ? [fill] : []
      })
    : []
  const bills = Array.isArray(value.bills)
    ? value.bills.flatMap((item) => {
        const bill = readBill(item)
        return bill ? [bill] : []
      })
    : []
  return {
    shifts,
    fuel,
    bills,
    settings: readSettings(value.settings),
    vehicles: readList(value.vehicles, readVehicle),
    odometerReadings: readList(value.odometerReadings, readReading),
    mileage: readList(value.mileage, readMileage),
    expenses: readList(value.expenses, readExpense),
    yearCoverage: readList(value.yearCoverage, readCoverage),
  }
}

/**
 * Reads the versioned envelope. Version 1 ledgers (shifts, fuel, bills, settings)
 * migrate in memory to the version 2 shape. Unknown vehicle fields are dropped.
 * A newer numeric version is still parsed for the fields this app knows.
 * Writing always stores version 2 under the same localStorage key.
 */
export function ledgerFromJson(raw: string): Persisted {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || typeof parsed.version !== "number" || parsed.version < 1) return EMPTY_LEDGER
    const snapshot = readSnapshot(parsed.data)
    if (!snapshot) return EMPTY_LEDGER
    const data = isRecord(parsed.data) ? parsed.data : {}
    const backup = readSnapshot(data.backup)
    return {
      ...snapshot,
      demo: data.demo === true,
      backup,
    }
  } catch {
    return EMPTY_LEDGER
  }
}

export function readLedger(): Persisted {
  if (typeof window === "undefined") return EMPTY_LEDGER
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_LEDGER
    return ledgerFromJson(raw)
  } catch {
    return EMPTY_LEDGER
  }
}

export function writeLedger(ledger: Persisted): boolean {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 2, data: ledger }),
    )
    return true
  } catch {
    return false
  }
}

export function hasLedgerContent(
  ledger: Pick<
    Persisted,
    "shifts" | "fuel" | "bills" | "settings" | "vehicles" | "mileage" | "expenses" | "odometerReadings"
  >,
): boolean {
  const { settings } = ledger
  return (
    ledger.shifts.length > 0 ||
    ledger.fuel.length > 0 ||
    ledger.bills.length > 0 ||
    ledger.vehicles.length > 0 ||
    ledger.mileage.length > 0 ||
    ledger.expenses.length > 0 ||
    ledger.odometerReadings.length > 0 ||
    settings.displayName.trim().length > 0 ||
    settings.province !== "" ||
    settings.weeklyIncomeTarget > 0 ||
    settings.litresPer100km !== null ||
    settings.fuelPricePerLitre !== null ||
    (settings.defaultPlatform !== "" && settings.defaultPlatform !== DEFAULT_PLATFORM)
  )
}
