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
import { hasLedgerContent, readLedger, writeLedger } from "@/lib/storage"
import { computeMetrics } from "@/lib/metrics"
import {
  EMPTY_LEDGER,
  type Bill,
  type DashboardMetrics,
  type FuelFill,
  type Persisted,
  type Settings,
  type Shift,
  type Snapshot,
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

function snapshotOf(ledger: Persisted): Snapshot {
  return {
    shifts: ledger.shifts,
    fuel: ledger.fuel,
    bills: ledger.bills,
    settings: ledger.settings,
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
    if (commit({ ...current, shifts })) showNotice("Shift saved")
    setPanel(null)
  }, [])

  const saveFuel = useCallback((fill: FuelFill) => {
    const current = clientSnapshot.ledger
    const exists = current.fuel.some((item) => item.id === fill.id)
    const fuel = exists
      ? current.fuel.map((item) => (item.id === fill.id ? fill : item))
      : [fill, ...current.fuel]
    if (commit({ ...current, fuel })) showNotice("Fill-up saved")
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
    if (saved) showNotice("Ledger cleared")
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
      })
      if (saved) showNotice("Shift deleted")
    } else if (confirm.type === "delete-fuel") {
      const saved = commit({
        ...ledgerNow,
        fuel: ledgerNow.fuel.filter((fill) => fill.id !== confirm.id),
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
    }),
    [
      closePanel,
      confirmPanel,
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
      saveFuel,
      saveShift,
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
