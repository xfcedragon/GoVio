import { isClock, isISODate } from "@/lib/dates"
import {
  BILL_CATEGORIES,
  EMPTY_LEDGER,
  EMPTY_SETTINGS,
  PROVINCES,
  type Bill,
  type BillCategory,
  type FuelFill,
  type Persisted,
  type ProvinceCode,
  type Settings,
  type Shift,
  type Snapshot,
} from "@/lib/types"

export const STORAGE_KEY = "skippilot.ledger.v1"

const PROVINCE_CODES = new Set<string>(PROVINCES.map((province) => province.code))
const CATEGORY_IDS = new Set<string>(BILL_CATEGORIES.map((category) => category.id))

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
  return {
    id: value.id,
    date: value.date,
    start: value.start,
    end: value.end,
    earnings: Math.round(earnings * 100) / 100,
    kilometres: Math.round(kilometres * 10) / 10,
    orders: orders !== null && orders >= 0 ? Math.round(orders) : null,
    area: typeof value.area === "string" ? value.area.slice(0, 60) : "",
    note: typeof value.note === "string" ? value.note.slice(0, 180) : "",
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
    station: typeof value.station === "string" ? value.station.slice(0, 60) : "",
    odometer: odometer !== null && odometer >= 0 ? Math.round(odometer) : null,
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
  return { shifts, fuel, bills, settings: readSettings(value.settings) }
}

export function readLedger(): Persisted {
  if (typeof window === "undefined") return EMPTY_LEDGER
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_LEDGER
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== 1) return EMPTY_LEDGER
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

export function writeLedger(ledger: Persisted): boolean {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, data: ledger }),
    )
    return true
  } catch {
    return false
  }
}

export function hasLedgerContent(ledger: Pick<Persisted, "shifts" | "fuel" | "bills" | "settings">): boolean {
  const { settings } = ledger
  return (
    ledger.shifts.length > 0 ||
    ledger.fuel.length > 0 ||
    ledger.bills.length > 0 ||
    settings.displayName.trim().length > 0 ||
    settings.province !== "" ||
    settings.weeklyIncomeTarget > 0 ||
    settings.litresPer100km !== null ||
    settings.fuelPricePerLitre !== null
  )
}
