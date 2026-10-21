"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react"
import { buildSample } from "@/lib/sample"
import { clearReceiptImages } from "@/lib/receipts-db"
import { hasLedgerContent, readLedger, writeLedger } from "@/lib/storage"
import { computeMetrics } from "@/lib/metrics"
import {
  EMPTY_LEDGER,
  type Bill,
  type ClaimStatus,
  type DashboardMetrics,
  type FuelFill,
  type MileageEntry,
  type OdometerReading,
  type Persisted,
  type Settings,
  type Shift,
  type Snapshot,
  type Vehicle,
  type VehicleExpense,
} from "@/lib/types"

type ConfirmKind =
  | { type: "delete-shift"; id: string }
  | { type: "delete-fuel"; id: string }
  | { type: "delete-bill"; id: string }
  | { type: "load-sample" }
  | { type: "clear-sample" }
  | { type: "clear-all" }

export type Panel =
  | { type: "shift"; shift: Shift | null }
  | { type: "fuel"; fill: FuelFill | null }
  | { type: "bill"; bill: Bill | null }
  | { type: "confirm"; confirm: ConfirmKind }
  | null

type ClientSnapshot = {
  ledger: Persisted
  now: Date | null
  notice: string | null
}

const serverSnapshot: ClientSnapshot = {
  ledger: EMPTY_LEDGER,
  now: null,
  notice: null,
}

let clientSnapshot: ClientSnapshot = serverSnapshot
let clientReady = false
const listeners = new Set<() => void>()
let noticeTimer: number | null = null

function emit() {
  listeners.forEach((listener) => listener())
}

function ensureClient() {
  if (clientReady || typeof window === "undefined") return
  const ledger = readLedger()
  clientSnapshot = {
    ledger,
    now: new Date(),
    notice: null,
  }
  clientReady = true
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  ensureClient()
  return clientSnapshot
}

function getServerSnapshot() {
  return serverSnapshot
}

function withoutSource(readings: OdometerReading[], source: OdometerReading["source"], sourceId: string) {
  return readings.filter((reading) => !(reading.source === source && reading.sourceId === sourceId))
}

/** Replaces this shift's own start/end readings and leaves every other reading in place. */
function syncShiftReadings(readings: OdometerReading[], shift: Shift): OdometerReading[] {
  const next = withoutSource(readings, "shift", shift.id)
  if (!shift.vehicleId) return next
  if (shift.startOdometer != null) {
    next.push({
      id: `${shift.id}:start`,
      vehicleId: shift.vehicleId,
      date: shift.date,
      kilometres: Math.round(shift.startOdometer),
      source: "shift",
      sourceId: shift.id,
      role: "start",
      note: "",
    })
  }
  if (shift.endOdometer != null) {
    next.push({
      id: `${shift.id}:end`,
      vehicleId: shift.vehicleId,
      date: shift.date,
      kilometres: Math.round(shift.endOdometer),
      source: "shift",
      sourceId: shift.id,
      role: "end",
      note: "",
    })
  }
  return next
}

function syncMileageReadings(readings: OdometerReading[], entry: MileageEntry): OdometerReading[] {
  const next = withoutSource(readings, "mileage", entry.id)
  if (!entry.vehicleId) return next
  if (entry.startOdometer != null) {
    next.push({
      id: `${entry.id}:start`,
      vehicleId: entry.vehicleId,
      date: entry.date,
      kilometres: Math.round(entry.startOdometer),
      source: "mileage",
      sourceId: entry.id,
      role: "start",
      note: "",
    })
  }
  if (entry.endOdometer != null) {
    next.push({
      id: `${entry.id}:end`,
      vehicleId: entry.vehicleId,
      date: entry.date,
      kilometres: Math.round(entry.endOdometer),
      source: "mileage",
      sourceId: entry.id,
      role: "end",
      note: "",
    })
  }
  return next
}

/**
 * A fill-up odometer is attached only when the ledger has one vehicle.
 * Older fill-ups have no vehicle id, so guessing among several cars would misfile the reading.
 */
function syncFuelReading(readings: OdometerReading[], fill: FuelFill, vehicleId: string | null): OdometerReading[] {
  const next = withoutSource(readings, "fuel", fill.id)
  if (!vehicleId || fill.odometer === null) return next
  next.push({
    id: `${fill.id}:odometer`,
    vehicleId,
    date: fill.date,
    kilometres: Math.round(fill.odometer),
    source: "fuel",
    sourceId: fill.id,
    role: "point",
    note: "",
  })
  return next
}

function snapshotOf(ledger: Persisted): Snapshot {
  return {
    shifts: ledger.shifts,
    fuel: ledger.fuel,
    bills: ledger.bills,
    settings: ledger.settings,
    vehicles: ledger.vehicles,
    odometerReadings: ledger.odometerReadings,
    mileage: ledger.mileage,
    expenses: ledger.expenses,
    yearCoverage: ledger.yearCoverage,
  }
}

function commit(ledger: Persisted) {
  ensureClient()
  const saved = writeLedger(ledger)
  clientSnapshot = {
    ledger,
    now: clientSnapshot.now ?? new Date(),
    notice: saved
      ? clientSnapshot.notice
      : "This browser blocked saving. The latest change is only on screen.",
  }
  emit()
  return saved
}

function showNotice(message: string) {
  ensureClient()
  clientSnapshot = { ...clientSnapshot, notice: message }
  emit()
  if (noticeTimer) window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    if (clientSnapshot.notice !== message) return
    clientSnapshot = { ...clientSnapshot, notice: null }
    emit()
  }, 3200)
}

type SkipPilotContextValue = {
  ready: boolean
  now: Date | null
  data: Persisted
  metrics: DashboardMetrics | null
  demo: boolean
  notice: string | null
  panel: Panel
  openShift: (shift?: Shift) => void
  openFuel: (fill?: FuelFill) => void
  openBill: (bill?: Bill) => void
  closePanel: () => void
  saveShift: (shift: Shift) => void
  saveFuel: (fill: FuelFill) => void
  saveBill: (bill: Bill) => void
  requestDeleteShift: (id: string) => void
  requestDeleteFuel: (id: string) => void
  requestDeleteBill: (id: string) => void
  confirmPanel: () => void
  toggleBillPaid: (id: string) => void
  updateSettings: (patch: Partial<Settings>) => boolean
  requestSample: () => void
  requestClearSample: () => void
  requestClearAll: () => void
  notify: (message: string) => void
  saveVehicle: (vehicle: Vehicle, reading: { date: string; kilometres: number } | null) => boolean
  deleteVehicle: (id: string) => boolean
  saveMileage: (entry: MileageEntry) => boolean
  deleteMileage: (id: string) => boolean
  saveExpense: (expense: VehicleExpense) => boolean
  deleteExpense: (id: string) => boolean
  setFuelClaimStatus: (id: string, status: ClaimStatus) => boolean
  setYearCoverage: (vehicleId: string, year: number, fullYearLogged: boolean) => boolean
}

const SkipPilotContext = createContext<SkipPilotContextValue | null>(null)

export function SkipPilotProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [panel, setPanel] = useState<Panel>(null)
  const { ledger, now, notice } = snapshot

  // Hydration renders getServerSnapshot, which keeps `now` null so the server
  // HTML stays free of this browser's ledger. Publish the client clock and
  // saved ledger after subscribe; pages already render the empty dashboard
  // from that server snapshot, then fill in saved entries on this update.
  useEffect(() => {
    ensureClient()
    emit()
    const id = window.setInterval(() => {
      clientSnapshot = { ...clientSnapshot, now: new Date() }
      emit()
    }, 60_000)
    return () => window.clearInterval(id)
  }, [])

  const closePanel = useCallback(() => setPanel(null), [])
  const openShift = useCallback((shift?: Shift) => {
    setPanel({ type: "shift", shift: shift ?? null })
  }, [])
  const openFuel = useCallback((fill?: FuelFill) => {
    setPanel({ type: "fuel", fill: fill ?? null })
  }, [])
  const openBill = useCallback((bill?: Bill) => {
    setPanel({ type: "bill", bill: bill ?? null })
  }, [])
  const notify = useCallback((message: string) => showNotice(message), [])

  const saveShift = useCallback((shift: Shift) => {
    const current = clientSnapshot.ledger
    const exists = current.shifts.some((item) => item.id === shift.id)
    const shifts = exists
      ? current.shifts.map((item) => (item.id === shift.id ? shift : item))
      : [shift, ...current.shifts]
    const odometerReadings = syncShiftReadings(current.odometerReadings, shift)
    if (commit({ ...current, shifts, odometerReadings })) showNotice("Shift saved")
    setPanel(null)
  }, [])

  const saveFuel = useCallback((fill: FuelFill) => {
    const current = clientSnapshot.ledger
    const previous = current.fuel.find((item) => item.id === fill.id)
    const nextFill: FuelFill = {
      ...fill,
      claimStatus: fill.claimStatus ?? previous?.claimStatus ?? "unreviewed",
    }
    const exists = previous !== undefined
    const fuel = exists
      ? current.fuel.map((item) => (item.id === nextFill.id ? nextFill : item))
      : [nextFill, ...current.fuel]
    const soleVehicle = current.vehicles.length === 1 ? current.vehicles[0].id : null
    const odometerReadings = syncFuelReading(current.odometerReadings, nextFill, soleVehicle)
    if (commit({ ...current, fuel, odometerReadings })) showNotice("Fill-up saved")
    setPanel(null)
  }, [])

  const saveBill = useCallback((bill: Bill) => {
    const current = clientSnapshot.ledger
    const exists = current.bills.some((item) => item.id === bill.id)
    const bills = exists
      ? current.bills.map((item) => (item.id === bill.id ? bill : item))
      : [bill, ...current.bills]
    if (commit({ ...current, bills })) showNotice("Bill saved")
    setPanel(null)
  }, [])

  const requestDeleteShift = useCallback((id: string) => {
    setPanel({ type: "confirm", confirm: { type: "delete-shift", id } })
  }, [])
  const requestDeleteFuel = useCallback((id: string) => {
    setPanel({ type: "confirm", confirm: { type: "delete-fuel", id } })
  }, [])
  const requestDeleteBill = useCallback((id: string) => {
    setPanel({ type: "confirm", confirm: { type: "delete-bill", id } })
  }, [])

  const toggleBillPaid = useCallback((id: string) => {
    const current = clientSnapshot.ledger
    const existing = current.bills.find((bill) => bill.id === id)
    if (!existing) return
    const paid = !existing.paid
    const saved = commit({
      ...current,
      bills: current.bills.map((bill) => (bill.id === id ? { ...bill, paid } : bill)),
    })
    if (saved) showNotice(paid ? "Bill marked paid" : "Bill marked unpaid")
  }, [])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const current = clientSnapshot.ledger
    return commit({ ...current, settings: { ...current.settings, ...patch } })
  }, [])

  const loadSample = useCallback(() => {
    const current = clientSnapshot.ledger
    const clock = clientSnapshot.now ?? new Date()
    const saved = commit({
      ...buildSample(clock),
      demo: true,
      backup: current.demo && current.backup ? current.backup : snapshotOf(current),
    })
    setPanel(null)
    if (saved) showNotice("Sample week loaded")
  }, [])

  const clearSample = useCallback(() => {
    const current = clientSnapshot.ledger
    const next = current.backup
      ? { ...current.backup, demo: false, backup: null }
      : EMPTY_LEDGER
    const saved = commit(next)
    setPanel(null)
    if (saved) showNotice("Sample data cleared")
  }, [])

  const clearAll = useCallback(() => {
    const saved = commit(EMPTY_LEDGER)
    setPanel(null)
    void clearReceiptImages().then((photosCleared) => {
      if (!saved) return
      showNotice(photosCleared ? "Ledger cleared" : "Ledger cleared. Receipt photos may still be in this browser.")
    })
  }, [])

  const requestSample = useCallback(() => {
    const current = clientSnapshot.ledger
    if (current.demo || !hasLedgerContent(current)) {
      loadSample()
      return
    }
    setPanel({ type: "confirm", confirm: { type: "load-sample" } })
  }, [loadSample])

  const requestClearSample = useCallback(() => {
    setPanel({ type: "confirm", confirm: { type: "clear-sample" } })
  }, [])
  const requestClearAll = useCallback(() => {
    setPanel({ type: "confirm", confirm: { type: "clear-all" } })
  }, [])

  const saveVehicle = useCallback((vehicle: Vehicle, reading: { date: string; kilometres: number } | null) => {
    const current = clientSnapshot.ledger
    const exists = current.vehicles.some((item) => item.id === vehicle.id)
    const vehicles = exists
      ? current.vehicles.map((item) => (item.id === vehicle.id ? vehicle : item))
      : [vehicle, ...current.vehicles]
    let odometerReadings = current.odometerReadings.filter((item) => item.id !== `${vehicle.id}:initial`)
    if (vehicle.initialOdometer !== null && vehicle.initialOdometerDate) {
      // The declared starting reading is one slot. Later "current" readings are appended below and are not replaced.
      odometerReadings = [
        ...odometerReadings,
        {
          id: `${vehicle.id}:initial`,
          vehicleId: vehicle.id,
          date: vehicle.initialOdometerDate,
          kilometres: Math.round(vehicle.initialOdometer),
          source: "initial",
          sourceId: vehicle.id,
          role: "point",
          note: "Initial reading",
        },
      ]
    }
    if (reading) {
      odometerReadings = [
        ...odometerReadings,
        {
          id: crypto.randomUUID(),
          vehicleId: vehicle.id,
          date: reading.date,
          kilometres: Math.round(reading.kilometres),
          source: "manual",
          sourceId: null,
          role: "point",
          note: "",
        },
      ]
    }
    const saved = commit({ ...current, vehicles, odometerReadings })
    if (saved) showNotice("Vehicle saved")
    return saved
  }, [])

  const deleteVehicle = useCallback((id: string) => {
    const current = clientSnapshot.ledger
    const saved = commit({
      ...current,
      vehicles: current.vehicles.filter((vehicle) => vehicle.id !== id),
      odometerReadings: current.odometerReadings.filter((reading) => reading.vehicleId !== id),
      yearCoverage: current.yearCoverage.filter((item) => item.vehicleId !== id),
      shifts: current.shifts.map((shift) => (shift.vehicleId === id ? { ...shift, vehicleId: null } : shift)),
      mileage: current.mileage.map((entry) => (entry.vehicleId === id ? { ...entry, vehicleId: null } : entry)),
      expenses: current.expenses.map((expense) => (expense.vehicleId === id ? { ...expense, vehicleId: null } : expense)),
    })
    if (saved) showNotice("Vehicle removed. Trips and receipts stayed, without that vehicle link.")
    return saved
  }, [])

  const saveMileage = useCallback((entry: MileageEntry) => {
    const current = clientSnapshot.ledger
    const exists = current.mileage.some((item) => item.id === entry.id)
    const mileage = exists
      ? current.mileage.map((item) => (item.id === entry.id ? entry : item))
      : [entry, ...current.mileage]
    const odometerReadings = syncMileageReadings(current.odometerReadings, entry)
    const saved = commit({ ...current, mileage, odometerReadings })
    if (saved) showNotice("Mileage entry saved")
    return saved
  }, [])

  const deleteMileage = useCallback((id: string) => {
    const current = clientSnapshot.ledger
    const saved = commit({
      ...current,
      mileage: current.mileage.filter((entry) => entry.id !== id),
      odometerReadings: withoutSource(current.odometerReadings, "mileage", id),
    })
    if (saved) showNotice("Mileage entry deleted")
    return saved
  }, [])

  const saveExpense = useCallback((expense: VehicleExpense) => {
    const current = clientSnapshot.ledger
    const exists = current.expenses.some((item) => item.id === expense.id)
    const expenses = exists
      ? current.expenses.map((item) => (item.id === expense.id ? expense : item))
      : [expense, ...current.expenses]
    const saved = commit({ ...current, expenses })
    if (saved) showNotice("Receipt saved")
    return saved
  }, [])

  const deleteExpense = useCallback((id: string) => {
    const current = clientSnapshot.ledger
    const saved = commit({
      ...current,
      expenses: current.expenses.filter((expense) => expense.id !== id),
    })
    if (saved) showNotice("Receipt deleted")
    return saved
  }, [])

  const setFuelClaimStatus = useCallback((id: string, status: ClaimStatus) => {
    const current = clientSnapshot.ledger
    const saved = commit({
      ...current,
      fuel: current.fuel.map((fill) => (fill.id === id ? { ...fill, claimStatus: status } : fill)),
    })
    if (saved) showNotice("Fill-up classification saved")
    return saved
  }, [])

  const setYearCoverage = useCallback((vehicleId: string, year: number, fullYearLogged: boolean) => {
    const current = clientSnapshot.ledger
    const yearCoverage = [
      ...current.yearCoverage.filter((item) => !(item.vehicleId === vehicleId && item.year === year)),
      { vehicleId, year, fullYearLogged },
    ]
    const saved = commit({ ...current, yearCoverage })
    if (saved) showNotice(fullYearLogged ? "Full year marked" : "Full-year mark removed")
    return saved
  }, [])

  const confirmPanel = useCallback(() => {
    if (panel?.type !== "confirm") return
    const confirm = panel.confirm
    if (confirm.type === "load-sample") {
      loadSample()
      return
    }
    if (confirm.type === "clear-sample") {
      clearSample()
      return
    }
    if (confirm.type === "clear-all") {
      clearAll()
      return
    }
    const ledgerNow = clientSnapshot.ledger
    if (confirm.type === "delete-shift") {
      const saved = commit({
        ...ledgerNow,
        shifts: ledgerNow.shifts.filter((shift) => shift.id !== confirm.id),
        odometerReadings: withoutSource(ledgerNow.odometerReadings, "shift", confirm.id),
      })
      if (saved) showNotice("Shift deleted")
    } else if (confirm.type === "delete-fuel") {
      const saved = commit({
        ...ledgerNow,
        fuel: ledgerNow.fuel.filter((fill) => fill.id !== confirm.id),
        odometerReadings: withoutSource(ledgerNow.odometerReadings, "fuel", confirm.id),
      })
      if (saved) showNotice("Fill-up deleted")
    } else {
      const saved = commit({
        ...ledgerNow,
        bills: ledgerNow.bills.filter((bill) => bill.id !== confirm.id),
      })
      if (saved) showNotice("Bill deleted")
    }
    setPanel(null)
  }, [clearAll, clearSample, loadSample, panel])

  const metrics = useMemo(() => (now ? computeMetrics(ledger, now) : null), [ledger, now])

  const value = useMemo<SkipPilotContextValue>(
    () => ({
      ready: now !== null,
      now,
      data: ledger,
      metrics,
      demo: ledger.demo,
      notice,
      panel,
      openShift,
      openFuel,
      openBill,
      closePanel,
      saveShift,
      saveFuel,
      saveBill,
      requestDeleteShift,
      requestDeleteFuel,
      requestDeleteBill,
      confirmPanel,
      toggleBillPaid,
      updateSettings,
      requestSample,
      requestClearSample,
      requestClearAll,
      notify,
      saveVehicle,
      deleteVehicle,
      saveMileage,
      deleteMileage,
      saveExpense,
      deleteExpense,
      setFuelClaimStatus,
      setYearCoverage,
    }),
    [
      closePanel,
      confirmPanel,
      deleteExpense,
      deleteMileage,
      deleteVehicle,
      ledger,
      metrics,
      notice,
      notify,
      now,
      openBill,
      openFuel,
      openShift,
      panel,
      requestClearAll,
      requestClearSample,
      requestDeleteBill,
      requestDeleteFuel,
      requestDeleteShift,
      requestSample,
      saveBill,
      saveExpense,
      saveFuel,
      saveMileage,
      saveShift,
      saveVehicle,
      setFuelClaimStatus,
      setYearCoverage,
      toggleBillPaid,
      updateSettings,
    ],
  )

  return <SkipPilotContext.Provider value={value}>{children}</SkipPilotContext.Provider>
}

export function useSkipPilot() {
  const value = useContext(SkipPilotContext)
  if (!value) throw new Error("useSkipPilot must be used within SkipPilotProvider")
  return value
}
