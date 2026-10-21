"use client"

import Link from "next/link"
import { Fuel, Pencil, Trash2 } from "lucide-react"
import { EmptyState } from "@/components/empty-state"
import { PageHeader } from "@/components/page-header"
import { Numeric } from "@/components/numeric"
import { StatCard } from "@/components/stat-card"
import { Button } from "@/components/ui/button"
import { formatWeekdayDate } from "@/lib/dates"
import { formatCad, formatKm, formatLitres } from "@/lib/format"
import { distanceFuelEstimate, fuelMethodLabel } from "@/lib/metrics"
import { useSkipPilot } from "@/lib/store"

export function FuelView() {
  const { metrics, data, openFuel, requestDeleteFuel } = useSkipPilot()

  const fills = [...data.fuel].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const estimate = metrics ? distanceFuelEstimate(metrics.week.kilometres, data.settings) : null
  const logged = metrics
    ? data.fuel
        .filter((fill) => fill.date >= metrics.weekStartIso && fill.date <= metrics.weekEndIso)
        .reduce((sum, fill) => sum + fill.total, 0)
    : 0

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fuel"
        title="What the week cost to drive"
        description="A fill-up logged this week is used as the fuel cost. If the week has none, SkipPilot can estimate from kilometres once you save a vehicle figure."
        actions={
          <Button type="button" className="h-10 px-3.5" onClick={() => openFuel()}>
            Log fill-up
          </Button>
        }
      />

      <section aria-label="Fuel summary" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatCard
          label="Used for net pay"
          value={!metrics || metrics.week.fuelMethod === "none" ? "—" : formatCad(metrics.week.fuelCost)}
          hint={metrics ? fuelMethodLabel(metrics.week.fuelMethod) : "Log a fill-up, or set L/100 km and a pump price"}
        />
        <StatCard
          label="Fill-ups this week"
          value={metrics && logged > 0 ? formatCad(logged) : "—"}
          hint={
            !metrics
              ? "Dated this week"
              : logged > 0
                ? "Sum of receipts dated this week"
                : "No receipt dated this week"
          }
        />
        <StatCard
          label="Distance estimate"
          value={estimate === null ? "—" : formatCad(estimate)}
          hint={
            !metrics
              ? "Set L/100 km and a pump price"
              : estimate === null
                ? `${formatKm(metrics.week.kilometres)} this week · set L/100 km and a pump price`
                : `${formatKm(metrics.week.kilometres)} × ${data.settings.litresPer100km} L/100 km`
          }
        />
      </section>

      <section className="rounded-2xl border border-border bg-card px-5 py-4 text-sm leading-6 text-muted-foreground">
        <h2 className="text-base font-semibold text-foreground">How the estimate is chosen</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>If a fill-up is dated this week, that receipt total is the fuel cost.</li>
          <li>Otherwise, kilometres × your L/100 km × your pump price, when both rates are saved.</li>
          <li>
            Earnings after fuel, on Overview, subtracts whichever figure is active.{" "}
            <Link href="/settings" className="text-primary hover:underline">
              Edit the vehicle rates
            </Link>
            .
          </li>
          <li>
            A fill-up is cash paid at the pump. It is not the same as fuel consumed on a shift.{" "}
            <Link href="/vehicle" className="text-primary hover:underline">
              Vehicle & Tax Records
            </Link>{" "}
            keeps those figures apart for the year. Linking a receipt there to this fill-up counts the purchase once.
          </li>
        </ol>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {fills.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <caption className="sr-only">Fuel fill-ups</caption>
              <thead>
                <tr className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-3 py-3 font-medium">Litres</th>
                  <th className="px-3 py-3 font-medium">Price</th>
                  <th className="px-3 py-3 font-medium">Total</th>
                  <th className="px-3 py-3 font-medium">Station</th>
                  <th className="px-5 py-3 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {fills.map((fill) => (
                  <tr key={fill.id} className="border-t border-border transition-colors hover:bg-white/[0.03]">
                    <td className="px-5 py-3 font-medium">{formatWeekdayDate(fill.date)}</td>
                    <td className="px-3 py-3">
                      <Numeric>{formatLitres(fill.litres)}</Numeric>
                    </td>
                    <td className="px-3 py-3">
                      <Numeric>{formatCad(fill.pricePerLitre)}/L</Numeric>
                    </td>
                    <td className="px-3 py-3">
                      <Numeric>{formatCad(fill.total)}</Numeric>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {fill.station || "—"}
                      {fill.odometer !== null ? ` · ${fill.odometer.toLocaleString("en-CA")} km` : ""}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit fill-up on ${formatWeekdayDate(fill.date)}`}
                          onClick={() => openFuel(fill)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete fill-up on ${formatWeekdayDate(fill.date)}`}
                          onClick={() => requestDeleteFuel(fill.id)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Fuel}
            title="No fill-ups yet"
            body="Enter the litres and price per litre from a receipt. That total is used for the week of the fill-up date."
            actions={
              <Button type="button" className="h-10 px-3.5" onClick={() => openFuel()}>
                Log fill-up
              </Button>
            }
          />
        )}
      </section>
    </div>
  )
}
