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

/** Tax classification for a trip. Unclassified kilometres are not treated as deductible. */
export const TRIP_PURPOSES = [
  { id: "unclassified", label: "Unclassified" },
  { id: "business", label: "Business" },
  { id: "personal", label: "Personal" },
  { id: "mixed", label: "Mixed" },
] as const

export type TripPurpose = (typeof TRIP_PURPOSES)[number]["id"]

export const DEFAULT_PLATFORM = "SkipTheDishes"

export const FUEL_TYPES = [
  { id: "gasoline", label: "Gasoline" },
  { id: "diesel", label: "Diesel" },
  { id: "hybrid", label: "Hybrid" },
  { id: "plugin-hybrid", label: "Plug-in hybrid" },
  { id: "electric", label: "Electric" },
  { id: "other", label: "Other" },
] as const

export type FuelType = (typeof FUEL_TYPES)[number]["id"]

/**
 * User's own label for whether an amount belongs in their deductible-style total.
 * Unreviewed is the default. SkipPilot does not decide CRA eligibility.
 */
export const CLAIM_STATUSES = [
  { id: "unreviewed", label: "Unreviewed" },
  { id: "not-claimed", label: "Not claimed" },
  { id: "claimed", label: "Claimed business" },
] as const

export type ClaimStatus = (typeof CLAIM_STATUSES)[number]["id"]

export const VEHICLE_EXPENSE_CATEGORIES = [
  { id: "fuel", label: "Fuel and oil" },
  { id: "maintenance", label: "Maintenance and repairs" },
  { id: "insurance", label: "Insurance" },
  { id: "registration", label: "Registration and licensing" },
  { id: "loan-interest", label: "Vehicle loan interest or leasing" },
  { id: "parking", label: "Parking and tolls" },
  { id: "other", label: "Other vehicle expenses" },
] as const

export type VehicleExpenseCategory = (typeof VEHICLE_EXPENSE_CATEGORIES)[number]["id"]

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
  /** Missing on ledgers saved before vehicle records. Treat as SkipTheDishes. */
  platform?: string
  vehicleId?: string | null
  startOdometer?: number | null
  endOdometer?: number | null
  /** Missing means unclassified, which is not business kilometres. */
  purpose?: TripPurpose
  /** Business portion when purpose is mixed. */
  businessKilometres?: number | null
  businessPurpose?: string
  /** Optional note or receipt id. Evidence is never required. */
  evidenceId?: string | null
  /** User confirmed an overlapping record should still be included. */
  overlapAcknowledged?: boolean
}

export type FuelFill = {
  id: string
  date: string
  litres: number
  pricePerLitre: number
  total: number
  station: string
  odometer: number | null
  /**
   * User classification for the tax-style total. Missing means unreviewed.
   * The fill still counts as cash spent on fuel either way.
   * A vehicle expense with fuelFillId set replaces this row in fuel-cash totals
   * so the same purchase is not added twice.
   */
  claimStatus?: ClaimStatus
}

export type Vehicle = {
  id: string
  make: string
  model: string
  year: number | null
  nickname: string
  fuelType: FuelType
  /**
   * Optional efficiency for this vehicle's estimates.
   * settings.litresPer100km stays the ledger-wide rate used by Hourly Earnings.
   */
  litresPer100km: number | null
  /** User-entered CAD per kilometre. An estimate, never part of the tax-style total. */
  wearPerKm: number | null
  initialOdometer: number | null
  initialOdometerDate: string | null
}

export type OdometerSource = "profile" | "initial" | "shift" | "mileage" | "fuel" | "manual"

export type OdometerReading = {
  id: string
  vehicleId: string
  date: string
  kilometres: number
  source: OdometerSource
  sourceId: string | null
  /** start/end distinguish the two ends of one trip. point is a standalone reading. */
  role: "start" | "end" | "point"
  note: string
}

/** A trip that is not a delivery shift, or a tax classification linked to a shift. */
export type MileageEntry = {
  id: string
  vehicleId: string | null
  date: string
  startOdometer: number | null
  endOdometer: number | null
  kilometres: number
  purpose: TripPurpose
  businessKilometres: number | null
  description: string
  note: string
  evidenceId: string | null
  /** When set, this entry classifies that shift and must not be added again as a second trip. */
  shiftId: string | null
  overlapAcknowledged: boolean
}

export type VehicleExpense = {
  id: string
  vehicleId: string | null
  category: VehicleExpenseCategory
  merchant: string
  /** Purchase date from the receipt, not the day the photo was added. */
  date: string
  fuelType: string
  litres: number | null
  pricePerLitre: number | null
  subtotal: number | null
  tax: number | null
  total: number
  currency: string
  claimStatus: ClaimStatus
  note: string
  /** IndexedDB key. Null when the user entered the receipt without a photo. */
  imageId: string | null
  imageName: string
  imageHash: string | null
  /** True only after IndexedDB accepted the blob. Never inferred from a chosen file. */
  imageSaved: boolean
  /**
   * When set, this expense is the same purchase as that ledger fill-up.
   * Fuel cash counts the expense and skips the fill.
   */
  fuelFillId: string | null
  uploadedAt: string | null
  duplicateAcknowledged: boolean
}

export type YearCoverage = {
  vehicleId: string
  year: number
  /** User says classified business and personal trips are the full year of driving. */
  fullYearLogged: boolean
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
  /** Default platform for new shifts. Does not change hourly math. */
  defaultPlatform: string
}

export type Snapshot = {
  shifts: Shift[]
  fuel: FuelFill[]
  bills: Bill[]
  settings: Settings
  vehicles: Vehicle[]
  odometerReadings: OdometerReading[]
  mileage: MileageEntry[]
  expenses: VehicleExpense[]
  yearCoverage: YearCoverage[]
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
  defaultPlatform: DEFAULT_PLATFORM,
}

export const EMPTY_SNAPSHOT: Snapshot = {
  shifts: [],
  fuel: [],
  bills: [],
  settings: EMPTY_SETTINGS,
  vehicles: [],
  odometerReadings: [],
  mileage: [],
  expenses: [],
  yearCoverage: [],
}

export const EMPTY_LEDGER: Persisted = {
  ...EMPTY_SNAPSHOT,
  demo: false,
  backup: null,
}
