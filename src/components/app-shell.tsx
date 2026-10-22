"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import {
  BillDialog,
  ConfirmDialog,
  FuelDialog,
  ShiftDialog,
} from "@/components/record-dialogs"
import { Button } from "@/components/ui/button"
import { useSkipPilot } from "@/lib/store"
import { cn } from "@/lib/utils"

type NavItem = { href: string; label: string }
type NavEntry =
  | { type: "link"; href: string; label: string }
  | { type: "group"; label: string; items: NavItem[] }

const NAV: NavEntry[] = [
  { type: "link", href: "/", label: "Overview" },
  {
    type: "group",
    label: "Work",
    items: [
      { href: "/shifts", label: "Shifts" },
      { href: "/hourly", label: "Earnings" },
      { href: "/vehicle#mileage", label: "Mileage" },
    ],
  },
  {
    type: "group",
    label: "Vehicle",
    items: [
      { href: "/fuel", label: "Fuel" },
      { href: "/vehicle#expenses", label: "Expenses" },
      { href: "/vehicle", label: "Vehicle" },
    ],
  },
  {
    type: "group",
    label: "Records",
    items: [
      { href: "/vehicle#receipts", label: "Receipts" },
      { href: "/vehicle#annual-summary", label: "Reports" },
      { href: "/bills", label: "Bills" },
    ],
  },
  { type: "link", href: "/settings", label: "Settings" },
]

function useHash() {
  const pathname = usePathname()
  const [hash, setHash] = useState("")
  useEffect(() => {
    const read = () => setHash(window.location.hash)
    read()
    window.addEventListener("hashchange", read)
    return () => window.removeEventListener("hashchange", read)
  }, [pathname])
  return hash
}

function isActive(pathname: string, hash: string, href: string) {
  const [path, fragment] = href.split("#")
  if (fragment) return pathname === path && hash === `#${fragment}`
  if (path === "/") return pathname === "/"
  if (path === "/vehicle") return pathname === "/vehicle" && (hash === "" || hash === "#")
  return pathname === path || pathname.startsWith(`${path}/`)
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="block">
      <span className="block text-sm font-medium tracking-tight text-foreground">GoVio</span>
      {compact ? null : (
        <span className="mt-1 block text-xs leading-4 text-muted-foreground">
          Know what you make.
          <br />
          Know what it costs.
        </span>
      )}
    </Link>
  )
}

function NavLink({
  href,
  label,
  active,
  compact,
}: {
  href: string
  label: string
  active: boolean
  compact: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative block rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
        compact && "shrink-0 whitespace-nowrap py-1",
        active &&
          "bg-sidebar-accent text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:bg-foreground",
      )}
    >
      {label}
    </Link>
  )
}

function NavLinks({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname()
  const hash = useHash()
  return (
    <nav aria-label="Primary" className={compact ? "flex items-center gap-3 overflow-x-auto" : "grid"}>
      {NAV.map((entry) => {
        if (entry.type === "link") {
          return (
            <div key={entry.href} className={compact ? "shrink-0" : "pt-3 first:pt-0"}>
              <NavLink
                href={entry.href}
                label={entry.label}
                active={isActive(pathname, hash, entry.href)}
                compact={compact}
              />
            </div>
          )
        }
        return (
          <div key={entry.label} className={compact ? "flex shrink-0 items-center gap-1" : "pt-4 first:pt-0"}>
            <p
              className={cn(
                "text-[10px] font-medium tracking-wide text-muted-foreground uppercase",
                compact ? "pr-0.5" : "px-2.5 pb-1",
              )}
            >
              {entry.label}
            </p>
            <div className={compact ? "flex" : "grid"}>
              {entry.items.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={isActive(pathname, hash, item.href)}
                  compact={compact}
                />
              ))}
            </div>
          </div>
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
      <div className="flex max-w-6xl flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-5 lg:px-6">
        <p className="text-sm leading-5 text-warning">
          <span className="font-medium">Sample week.</span> These figures are illustrations, not your
          delivery payouts. Clearing the sample restores whatever this browser had before the preview.
        </p>
        <Button type="button" variant="outline" className="h-8 shrink-0" onClick={requestClearSample}>
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
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-border bg-popover px-3 py-1.5 text-sm text-popover-foreground"
    >
      {notice}
    </div>
  )
}

const AUTH_SCREENS = new Set(["/login", "/signup", "/forgot-password", "/reset-password"])

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready } = useSkipPilot()
  const pathname = usePathname()
  if (AUTH_SCREENS.has(pathname)) {
    return (
      <div className="min-h-full bg-background">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <header className="border-b border-border px-4 py-3 sm:px-6">
          <Wordmark />
        </header>
        <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8 sm:px-6">
          {children}
        </main>
      </div>
    )
  }
  return (
    <div className="flex min-h-full bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="px-4 pt-4 pb-3">
          <Wordmark />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2">
          <NavLinks />
        </div>
        <div className="border-t border-sidebar-border px-4 py-3">
          <p className="text-xs leading-5 text-muted-foreground">
            On this device. The ledger stays in this browser until you confirm a migration.
          </p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background lg:hidden">
          <div className="px-4 pt-3">
            <Wordmark compact />
          </div>
          <div className="px-2 py-2">
            <NavLinks compact />
          </div>
        </header>
        <DemoBanner />
        <main id="main" aria-busy={!ready} className="w-full max-w-6xl flex-1 px-4 py-4 sm:px-5 lg:px-6 lg:py-5">
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
