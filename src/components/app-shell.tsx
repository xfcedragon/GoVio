"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Fuel,
  LayoutDashboard,
  Receipt,
  Route,
  Settings,
  Timer,
} from "lucide-react"
import {
  BillDialog,
  ConfirmDialog,
  FuelDialog,
  ShiftDialog,
} from "@/components/record-dialogs"
import { Button } from "@/components/ui/button"
import { useSkipPilot } from "@/lib/store"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/", label: "Overview", short: "Overview", icon: LayoutDashboard },
  { href: "/shifts", label: "Shifts", short: "Shifts", icon: Route },
  { href: "/hourly", label: "Hourly Earnings", short: "Hourly", icon: Timer },
  { href: "/fuel", label: "Fuel", short: "Fuel", icon: Fuel },
  { href: "/bills", label: "Bills & Goals", short: "Bills", icon: Receipt },
  { href: "/settings", label: "Settings", short: "Settings", icon: Settings },
] as const

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
        <Route className="size-4" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-[15px] font-semibold tracking-tight text-foreground">
          Skip<span className="text-primary">Pilot</span>
        </span>
        {compact ? null : (
          <span className="block text-xs text-muted-foreground">Driver ledger</span>
        )}
      </span>
    </Link>
  )
}

function NavLinks({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname()
  return (
    <nav aria-label="Primary" className={compact ? "flex gap-1 overflow-x-auto" : "grid gap-1"}>
      {NAV.map((item) => {
        const active = isActive(pathname, item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
              compact && "shrink-0 py-2",
              active && "bg-sidebar-accent text-foreground",
            )}
          >
            <Icon className={cn("size-4", active && "text-primary")} aria-hidden="true" />
            {compact ? item.short : item.label}
          </Link>
        )
      })}
    </nav>
  )
}

function DemoBanner() {
  const { demo, requestClearSample } = useSkipPilot()
  if (!demo) return null
  return (
    <div className="border-b border-warning/30 bg-warning/10">
      <div className="flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
        <p className="text-sm leading-6 text-warning">
          <span className="font-semibold">Sample week.</span> These figures are illustrations, not your
          SkipTheDishes payouts. Clearing the sample restores whatever this browser had before the preview.
        </p>
        <Button type="button" variant="outline" className="h-9 shrink-0" onClick={requestClearSample}>
          Clear sample data
        </Button>
      </div>
    </div>
  )
}

function Notice() {
  const { notice } = useSkipPilot()
  if (!notice) return null
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-popover px-4 py-2 text-sm text-popover-foreground shadow-lg"
    >
      {notice}
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready } = useSkipPilot()
  return (
    <div className="flex min-h-full bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="px-4 pt-6 pb-6">
          <Wordmark />
        </div>
        <div className="px-3">
          <p className="px-3 pb-2 text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
            Ledger
          </p>
          <NavLinks />
        </div>
        <div className="mt-auto border-t border-sidebar-border px-5 py-4">
          <p className="text-xs font-medium text-foreground">On this device</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            No account. Entries stay in this browser, in Canadian dollars.
          </p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Wordmark compact />
          </div>
          <div className="px-2 pb-2">
            <NavLinks compact />
          </div>
        </header>
        <DemoBanner />
        <main id="main" aria-busy={!ready} className="w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          {children}
        </main>
      </div>
      <ShiftDialog />
      <FuelDialog />
      <BillDialog />
      <ConfirmDialog />
      <Notice />
    </div>
  )
}
