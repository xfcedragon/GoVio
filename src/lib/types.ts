export const PROVINCES = [
  { code: "AB", name: "Alberta" },
  { code: "BC", name: "British Columbia" },
  { code: "MB", name: "Manitoba" },
  { code: "NB", name: "New Brunswick" },
  { code: "NL", name: "Newfoundland and Labrador" },
  { code: "NS", name: "Nova Scotia" },
  { code: "NT", name: "Northwest Territories" },
  { code: "NU", name: "Nunavut" },
  { code: "ON", name: "Ontario" },
  { code: "PE", name: "Prince Edward Island" },
  { code: "QC", name: "Quebec" },
  { code: "SK", name: "Saskatchewan" },
  { code: "YT", name: "Yukon" },
] as const

export type ProvinceCode = (typeof PROVINCES)[number]["code"]

export const BILL_CATEGORIES = [
  { id: "housing", label: "Housing" },
  { id: "insurance", label: "Insurance" },
  { id: "phone", label: "Phone" },
  { id: "vehicle", label: "Vehicle" },
  { id: "other", label: "Other" },
] as const

export type BillCategory = (typeof BILL_CATEGORIES)[number]["id"]

export type FuelMethod = "fillups" | "estimate" | "none"

export type Shift = {
  id: string
  date: string
  start: string
  end: string
  earnings: number
  kilometres: number
  orders: number | null
  area: string
  note: string
}

export type FuelFill = {
  id: string
  date: string
  litres: number
  pricePerLitre: number
  total: number
  station: string
  odometer: number | null
}

export type Bill = {
  id: string
  name: string
  amount: number
  dueDate: string
  category: BillCategory
  paid: boolean
}

export type Settings = {
  displayName: string
  province: ProvinceCode | ""
  weeklyIncomeTarget: number
  litresPer100km: number | null
  fuelPricePerLitre: number | null
}

export type Snapshot = {
  shifts: Shift[]
  fuel: FuelFill[]
  bills: Bill[]
  settings: Settings
}

export type Persisted = Snapshot & {
  demo: boolean
  backup: Snapshot | null
}

export type PeriodSnapshot = {
  earnings: number
  kilometres: number
  hours: number
  shiftCount: number
  fuelCost: number
  fuelMethod: FuelMethod
  net: number | null
}

export type DashboardMetrics = {
  todayIso: string
  weekStartIso: string
  weekEndIso: string
  today: PeriodSnapshot
  week: PeriodSnapshot
  allTime: {
    earnings: number
    kilometres: number
    hours: number
    shiftCount: number
  }
  hasShifts: boolean
  target: number
  weekProgress: number | null
}

export const EMPTY_SETTINGS: Settings = {
  displayName: "",
  province: "",
  weeklyIncomeTarget: 0,
  litresPer100km: null,
  fuelPricePerLitre: null,
}

export const EMPTY_SNAPSHOT: Snapshot = {
  shifts: [],
  fuel: [],
  bills: [],
  settings: EMPTY_SETTINGS,
}

export const EMPTY_LEDGER: Persisted = {
  ...EMPTY_SNAPSHOT,
  demo: false,
  backup: null,
}
