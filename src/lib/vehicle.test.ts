import assert from "node:assert/strict"
import { test } from "node:test"
import { ledgerFromJson } from "@/lib/storage"
import { EMPTY_SETTINGS, type FuelFill, type MileageEntry, type Shift, type Vehicle, type VehicleExpense } from "@/lib/types"
import {
  applyOverlapPolicy,
  buildAnnualSummary,
  businessKilometresAfterOverlap,
  distanceFromOdometer,
  findDuplicateExpenses,
  findOverlaps,
  resolveTripKilometres,
  type SpanRecord,
} from "@/lib/vehicle"

function span(partial: Partial<SpanRecord> & Pick<SpanRecord, "id">): SpanRecord {
  return {
    id: partial.id,
    vehicleId: partial.vehicleId === undefined ? "van" : partial.vehicleId,
    date: partial.date ?? "2026-06-01",
    startOdometer: partial.startOdometer === undefined ? 1000 : partial.startOdometer,
    endOdometer: partial.endOdometer === undefined ? 1100 : partial.endOdometer,
    shiftId: partial.shiftId ?? null,
    isShift: partial.isShift ?? false,
    overlapAcknowledged: partial.overlapAcknowledged ?? false,
    businessKm: partial.businessKm ?? 0,
    recordedKm: partial.recordedKm ?? partial.businessKm ?? 0,
  }
}

function vehicle(partial: Partial<Vehicle> = {}): Vehicle {
  return {
    id: partial.id ?? "van",
    make: partial.make ?? "Toyota",
    model: partial.model ?? "Corolla",
    year: partial.year ?? 2018,
    nickname: partial.nickname ?? "",
    fuelType: partial.fuelType ?? "gasoline",
    litresPer100km: partial.litresPer100km ?? null,
    wearPerKm: partial.wearPerKm ?? null,
    initialOdometer: partial.initialOdometer ?? null,
    initialOdometerDate: partial.initialOdometerDate ?? null,
  }
}

function expense(partial: Partial<VehicleExpense> & Pick<VehicleExpense, "id" | "date" | "total">): VehicleExpense {
  return {
    id: partial.id,
    vehicleId: partial.vehicleId ?? "van",
    category: partial.category ?? "maintenance",
    merchant: partial.merchant ?? "Shop",
    date: partial.date,
    fuelType: partial.fuelType ?? "",
    litres: partial.litres ?? null,
    pricePerLitre: partial.pricePerLitre ?? null,
    subtotal: partial.subtotal ?? null,
    tax: partial.tax ?? null,
    total: partial.total,
    currency: partial.currency ?? "CAD",
    claimStatus: partial.claimStatus ?? "unreviewed",
    note: partial.note ?? "",
    imageId: partial.imageId ?? null,
    imageName: partial.imageName ?? "",
    imageHash: partial.imageHash ?? null,
    imageSaved: partial.imageSaved ?? false,
    fuelFillId: partial.fuelFillId ?? null,
    uploadedAt: partial.uploadedAt ?? null,
    duplicateAcknowledged: partial.duplicateAcknowledged ?? false,
  }
}

function shift(partial: Partial<Shift> & Pick<Shift, "id" | "date" | "earnings">): Shift {
  return {
    id: partial.id,
    date: partial.date,
    start: partial.start ?? "10:00",
    end: partial.end ?? "14:00",
    earnings: partial.earnings,
    kilometres: partial.kilometres ?? 0,
    orders: null,
    area: partial.area ?? "",
    note: partial.note ?? "",
    vehicleId: partial.vehicleId ?? null,
    purpose: partial.purpose,
    businessKilometres: partial.businessKilometres,
    startOdometer: partial.startOdometer,
    endOdometer: partial.endOdometer,
    overlapAcknowledged: partial.overlapAcknowledged,
  }
}

function fill(partial: Partial<FuelFill> & Pick<FuelFill, "id" | "date" | "total">): FuelFill {
  return {
    id: partial.id,
    date: partial.date,
    litres: partial.litres ?? 10,
    pricePerLitre: partial.pricePerLitre ?? 1.5,
    total: partial.total,
    station: partial.station ?? "Station",
    odometer: partial.odometer ?? null,
    claimStatus: partial.claimStatus,
  }
}

test("mileage is the ending odometer minus the start", () => {
  const measured = distanceFromOdometer(12000, 12048)
  assert.deepEqual(measured, { ok: true, kilometres: 48 })
  const resolved = resolveTripKilometres({
    startOdometer: 12000,
    endOdometer: 12048,
    enteredKilometres: null,
  })
  assert.equal(resolved.kilometres, 48)
  assert.equal(resolved.source, "odometer")
  assert.equal(resolved.rejected, null)
})

test("a valid odometer difference replaces typed kilometres that disagree", () => {
  const resolved = resolveTripKilometres({
    startOdometer: 1000,
    endOdometer: 1050,
    enteredKilometres: 40,
  })
  assert.equal(resolved.kilometres, 50)
  assert.equal(resolved.source, "odometer")
  assert.match(resolved.warning ?? "", /50 km/)
  assert.match(resolved.warning ?? "", /40/)
})

test("ending odometer below the start is rejected", () => {
  assert.deepEqual(distanceFromOdometer(500, 499), { ok: false, reason: "end-before-start" })
  const resolved = resolveTripKilometres({
    startOdometer: 500,
    endOdometer: 499,
    enteredKilometres: 12,
  })
  assert.equal(resolved.rejected?.includes("lower"), true)
  assert.equal(resolved.source, "entered")
  assert.equal(resolved.kilometres, 12)
})

test("an absurd odometer jump is rejected", () => {
  assert.equal(distanceFromOdometer(1000, 3500).ok, false)
})

test("overlapping odometer spans warn and the later trip stays out of business km until acknowledged", () => {
  const earlier = span({
    id: "a",
    date: "2026-03-01",
    startOdometer: 1000,
    endOdometer: 1100,
    businessKm: 100,
    recordedKm: 100,
  })
  const later = span({
    id: "b",
    date: "2026-03-02",
    startOdometer: 1050,
    endOdometer: 1200,
    businessKm: 150,
    recordedKm: 150,
  })
  const hits = findOverlaps(later, [earlier])
  assert.equal(hits.length, 1)
  assert.equal(hits[0].reason, "odometer-span")
  assert.equal(hits[0].otherId, "a")
  assert.equal(businessKilometresAfterOverlap([earlier, later]), 100)
  const acknowledged = applyOverlapPolicy([{ ...later, overlapAcknowledged: true }, earlier])
  assert.equal(acknowledged.excluded.length, 0)
  assert.equal(businessKilometresAfterOverlap([{ ...later, overlapAcknowledged: true }, earlier]), 250)
})

test("trips that only touch at an odometer endpoint are not an overlap", () => {
  const first = span({ id: "a", startOdometer: 1000, endOdometer: 1100 })
  const next = span({ id: "b", startOdometer: 1100, endOdometer: 1200 })
  assert.deepEqual(findOverlaps(next, [first]), [])
})

test("a mileage entry linked to the same shift is a duplicate linkage", () => {
  const shiftRecord = span({ id: "shift-1", isShift: true, shiftId: null, businessKm: 30, recordedKm: 30 })
  const mileage = span({ id: "mile-1", isShift: false, shiftId: "shift-1", businessKm: 30, recordedKm: 30, startOdometer: null, endOdometer: null })
  const hits = findOverlaps(mileage, [shiftRecord])
  assert.equal(hits[0]?.reason, "shift-link")
  assert.equal(businessKilometresAfterOverlap([shiftRecord, mileage]), 30)
})

test("the same odometer span on a different vehicle is not an overlap", () => {
  const car = span({ id: "car", vehicleId: "car" })
  const van = span({ id: "van", vehicleId: "van" })
  assert.deepEqual(findOverlaps(van, [car]), [])
})

test("claimed expenses are the only amounts in the tax-style total", () => {
  const summary = buildAnnualSummary({
    year: 2026,
    shifts: [],
    fuel: [],
    mileage: [],
    vehicles: [vehicle()],
    readings: [],
    yearCoverage: [],
    settings: EMPTY_SETTINGS,
    expenses: [
      expense({ id: "m", date: "2026-04-01", total: 80, category: "maintenance", claimStatus: "claimed" }),
      expense({ id: "i", date: "2026-04-02", total: 100, category: "insurance", claimStatus: "unreviewed" }),
      expense({ id: "p", date: "2026-04-03", total: 20, category: "parking", claimStatus: "not-claimed" }),
    ],
  })
  assert.equal(summary.claimedTotal, 80)
  assert.equal(summary.unreviewedTotal, 100)
  assert.equal(summary.notClaimedTotal, 20)
  assert.equal(summary.maintenanceCash, 80)
  assert.equal(summary.expensesByCategory.find((category) => category.id === "insurance")?.cash, 100)
  assert.notEqual(summary.claimedTotal, summary.cashExpenseTotal)
})

test("a receipt counts in the purchase year, not the upload year", () => {
  const lateUpload = expense({
    id: "late",
    date: "2025-12-31",
    uploadedAt: "2026-01-15",
    total: 70,
    category: "insurance",
    claimStatus: "claimed",
  })
  const earlyUpload = expense({
    id: "early",
    date: "2026-01-02",
    uploadedAt: "2025-12-20",
    total: 30,
    category: "registration",
    claimStatus: "claimed",
  })
  const year2026 = buildAnnualSummary({
    year: 2026,
    shifts: [],
    fuel: [],
    mileage: [],
    vehicles: [],
    readings: [],
    yearCoverage: [],
    settings: EMPTY_SETTINGS,
    expenses: [lateUpload, earlyUpload],
  })
  const year2025 = buildAnnualSummary({
    year: 2025,
    shifts: [],
    fuel: [],
    mileage: [],
    vehicles: [],
    readings: [],
    yearCoverage: [],
    settings: EMPTY_SETTINGS,
    expenses: [lateUpload, earlyUpload],
  })
  assert.equal(year2026.claimedTotal, 30)
  assert.equal(year2025.claimedTotal, 70)
})

test("duplicate detection matches image hash or date, total, and merchant", () => {
  const existing = [
    { id: "1", date: "2026-05-01", total: 40, merchant: "Petro-Canada", imageHash: "abc" },
  ]
  const byMerchant = findDuplicateExpenses(
    { id: "2", date: "2026-05-01", total: 40, merchant: "petro-canada", imageHash: null },
    existing,
  )
  assert.equal(byMerchant[0]?.reason, "date-total-merchant")
  const byHash = findDuplicateExpenses(
    { id: "3", date: "2026-08-01", total: 9, merchant: "Other", imageHash: "abc" },
    existing,
  )
  assert.equal(byHash[0]?.reason, "image-hash")
  const self = findDuplicateExpenses(
    { id: "1", date: "2026-05-01", total: 40, merchant: "Petro-Canada", imageHash: "abc" },
    existing,
  )
  assert.deepEqual(self, [])
})

test("business-use percentage is unavailable when year odometer bookends are missing", () => {
  const summary = buildAnnualSummary({
    year: 2026,
    shifts: [shift({ id: "s", date: "2026-06-01", earnings: 90, kilometres: 40, vehicleId: "van", purpose: "business" })],
    fuel: [],
    mileage: [],
    vehicles: [vehicle()],
    readings: [{ id: "r", vehicleId: "van", date: "2026-06-01", kilometres: 20000, source: "manual", sourceId: null, role: "point", note: "" }],
    yearCoverage: [],
    settings: EMPTY_SETTINGS,
    expenses: [],
  })
  assert.equal(summary.businessUse.available, false)
  if (!summary.businessUse.available) {
    assert.match(summary.businessUse.reason, /unavailable/i)
    assert.match(summary.businessUse.reason, /not filled in as the remainder/i)
  }
  assert.equal(summary.businessKilometres, 40)
  assert.equal(summary.personalKilometres, 0)
})

test("business-use percentage uses odometer bookends when both ends exist", () => {
  const summary = buildAnnualSummary({
    year: 2026,
    shifts: [shift({ id: "s", date: "2026-06-01", earnings: 200, kilometres: 2000, vehicleId: "van", purpose: "business" })],
    fuel: [],
    mileage: [],
    vehicles: [vehicle({ initialOdometer: 10000, initialOdometerDate: "2025-12-15" })],
    readings: [{ id: "end", vehicleId: "van", date: "2026-12-31", kilometres: 15000, source: "manual", sourceId: null, role: "point", note: "" }],
    yearCoverage: [],
    settings: EMPTY_SETTINGS,
    expenses: [],
  })
  assert.equal(summary.businessUse.available, true)
  if (summary.businessUse.available) {
    assert.equal(summary.businessUse.method, "odometer-bookends")
    assert.equal(summary.businessUse.denominatorKm, 5000)
    assert.equal(summary.businessUse.numeratorKm, 2000)
    assert.equal(summary.businessUse.percentage, 40)
  }
})

test("fuel cash and estimated fuel consumed stay separate and unreviewed fill-ups are not claimed", () => {
  const summary = buildAnnualSummary({
    year: 2026,
    shifts: [shift({ id: "s", date: "2026-06-01", earnings: 100, kilometres: 100, purpose: "unclassified" })],
    fuel: [fill({ id: "f", date: "2026-06-02", total: 50, litres: 30, claimStatus: "unreviewed" })],
    mileage: [],
    vehicles: [vehicle({ wearPerKm: 0.1 })],
    readings: [],
    yearCoverage: [],
    settings: { ...EMPTY_SETTINGS, litresPer100km: 10, fuelPricePerLitre: 2 },
    expenses: [],
  })
  assert.equal(summary.fuel.cash, 50)
  assert.equal(summary.fuel.litresPurchased, 30)
  assert.equal(summary.fuel.consumedLitres, 10)
  assert.equal(summary.fuel.consumedCost, 20)
  assert.equal(summary.claimedTotal, 0)
  assert.notEqual(summary.claimedTotal, summary.fuel.cash + (summary.fuel.consumedCost ?? 0))
  assert.equal(summary.wear.cost, 10)
  assert.equal(summary.operating.total, 60)
  assert.notEqual(summary.claimedTotal, summary.operating.total)
  assert.equal(summary.grossDeliveryIncome, 100)
})

test("a fuel expense linked to a fill-up is not added on top of that fill-up", () => {
  const summary = buildAnnualSummary({
    year: 2026,
    shifts: [],
    fuel: [fill({ id: "f", date: "2026-02-01", total: 50, litres: 30, station: "Petro-Canada" })],
    mileage: [],
    vehicles: [vehicle()],
    readings: [],
    yearCoverage: [],
    settings: EMPTY_SETTINGS,
    expenses: [
      expense({
        id: "e",
        date: "2026-02-01",
        total: 50,
        category: "fuel",
        merchant: "Petro-Canada",
        litres: 30,
        claimStatus: "claimed",
        fuelFillId: "f",
      }),
    ],
  })
  assert.equal(summary.fuel.cash, 50)
  assert.equal(summary.fuel.litresPurchased, 30)
  assert.equal(summary.claimedTotal, 50)
})

test("unclassified shift kilometres are not business kilometres", () => {
  const summary = buildAnnualSummary({
    year: 2026,
    shifts: [shift({ id: "s", date: "2026-01-04", earnings: 80, kilometres: 22 })],
    fuel: [],
    mileage: [] as MileageEntry[],
    vehicles: [],
    readings: [],
    yearCoverage: [],
    settings: EMPTY_SETTINGS,
    expenses: [],
  })
  assert.equal(summary.recordedKilometres, 22)
  assert.equal(summary.businessKilometres, 0)
  assert.equal(summary.unclassifiedKilometres, 22)
})

test("a version 1 ledger still loads shifts, fuel, bills, and settings", () => {
  const raw = JSON.stringify({
    version: 1,
    data: {
      shifts: [
        {
          id: "old",
          date: "2024-03-02",
          start: "11:00",
          end: "15:00",
          earnings: 90.5,
          kilometres: 41.2,
          orders: 7,
          area: "Downtown",
          note: "Kept",
        },
      ],
      fuel: [
        {
          id: "old-fuel",
          date: "2024-03-02",
          litres: 20,
          pricePerLitre: 1.5,
          total: 30,
          station: "Old station",
          odometer: 1000,
        },
      ],
      bills: [
        {
          id: "old-bill",
          name: "Phone",
          amount: 50,
          dueDate: "2024-03-10",
          category: "phone",
          paid: false,
        },
      ],
      settings: {
        displayName: "Asha",
        province: "BC",
        weeklyIncomeTarget: 400,
        litresPer100km: 8.4,
        fuelPricePerLitre: 1.62,
      },
      demo: false,
      backup: null,
      vehicles: [{ id: "", make: "Nope" }, { not: "a vehicle" }],
    },
  })
  const ledger = ledgerFromJson(raw)
  assert.equal(ledger.shifts.length, 1)
  assert.equal(ledger.shifts[0].earnings, 90.5)
  assert.equal(ledger.shifts[0].purpose, "unclassified")
  assert.equal(ledger.shifts[0].platform, "SkipTheDishes")
  assert.equal(ledger.fuel[0].total, 30)
  assert.equal(ledger.fuel[0].claimStatus, "unreviewed")
  assert.equal(ledger.bills[0].name, "Phone")
  assert.equal(ledger.settings.displayName, "Asha")
  assert.equal(ledger.settings.province, "BC")
  assert.equal(ledger.settings.litresPer100km, 8.4)
  assert.equal(ledger.vehicles.length, 0)
  assert.equal(ledger.expenses.length, 0)
})
