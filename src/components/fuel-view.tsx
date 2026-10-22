"use client"

import Link from "next/link"
import { Pencil, Trash2 } from "lucide-react"
import { EmptyState } from "@/components/empty-state"
import { textLinkClass } from "@/components/field"
import { PageHeader } from "@/components/page-header"
import { Numeric } from "@/components/numeric"
import { FigureRow } from "@/components/stat-card"
import { Button } from "@/components/ui/button"
import { formatMonthDay, formatWeekdayDate } from "@/lib/dates"
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
  const loggedKnown = metrics !== null && logged > 0
  const weekFigureKnown = metrics !== null && metrics.week.fuelMethod !== "none"

  return (
    <div className="space-y-4">
      <PageHeader
        title="Fuel"
        description="A fill-up is cash paid at the pump. Estimated fuel consumed is kilometres × L/100 km × pump price. They are not the same figure."
        actions={
          <Button type="button" className="h-8 px-3" onClick={() => openFuel()}>
            Log fill-up
          </Button>
        }
      />

      <section aria-label="Fuel summary" className="rounded-md border border-border bg-card px-3 py-3">
        <FigureRow
          columns="grid-cols-1 sm:grid-cols-3"
          items={[
            {
              label: "Fuel purchases",
              value: loggedKnown ? formatCad(logged) : metrics ? "Unavailable" : "—",
              tone: loggedKnown ? "default" : "muted",
              hint: loggedKnown ? "Sum of receipts dated this week" : "No receipt dated this week",
            },
            {
              label: "Est. fuel consumed",
              value: estimate === null ? (metrics ? "Unavailable" : "—") : formatCad(estimate),
              tone: "muted",
              hint: metrics
                ? estimate === null
                  ? `${formatKm(metrics.week.kilometres)} this week · set L/100 km and a pump price`
                  : `${formatKm(metrics.week.kilometres)} × ${data.settings.litresPer100km} L/100 km`
                : "Set L/100 km and a pump price",
            },
            {
              label: "Week fuel figure",
              value: weekFigureKnown && metrics ? formatCad(metrics.week.fuelCost) : metrics ? "Unavailable" : "—",
              tone: "muted",
              hint: metrics ? fuelMethodLabel(metrics.week.fuelMethod) : "Log a fill-up, or set L/100 km and a pump price",
            },
          ]}
        />
      </section>

      <section className="rounded-md border border-border bg-card px-3 py-3 text-sm leading-5 text-muted-foreground">
        <h2 className="text-[11px] font-medium tracking-wide text-foreground uppercase">How the week figure is chosen</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>If a fill-up is dated this week, that receipt total is the week fuel figure.</li>
          <li>Otherwise, kilometres × your L/100 km × your pump price, when both rates are saved.</li>
          <li>
            Overview keeps fuel purchases and estimated fuel consumed on separate lines. Estimated net subtracts only
            the consumption estimate. A missing estimate stays unavailable.{" "}
            <Link href="/settings" className={textLinkClass}>
              Vehicle rates
            </Link>
            .
          </li>
          <li>
            A fill-up is not fuel burned on a shift.{" "}
            <Link href="/vehicle#receipts" className={textLinkClass}>
              Receipts
            </Link>{" "}
            keep the year&apos;s purchases. Linking a receipt there to this fill-up counts the purchase once.
          </li>
        </ol>
      </section>

      <section className="overflow-hidden rounded-md border border-border bg-card">
        <div className="border-b border-border px-3 py-2">
          <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Fuel</h2>
        </div>
        {fills.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Fuel fill-ups</caption>
              <thead>
                <tr className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Station</th>
                  <th className="px-3 py-2 text-right font-medium">Litres</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {fills.map((fill) => (
                  <tr key={fill.id} className="border-t border-border hover:bg-white/[0.03]">
                    <td className="px-3 py-2 font-medium" title={formatWeekdayDate(fill.date)}>
                      {formatMonthDay(fill.date)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {fill.station || "—"}
                      {fill.odometer !== null ? ` · ${fill.odometer.toLocaleString("en-CA")} km` : ""}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Numeric>{formatLitres(fill.litres)}</Numeric>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Numeric>{formatCad(fill.pricePerLitre)}/L</Numeric>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Numeric>{formatCad(fill.total)}</Numeric>
                    </td>
                    <td className="px-2 py-1 text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit fill-up on ${formatWeekdayDate(fill.date)}`}
                          onClick={() => openFuel(fill)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
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
            title="No fill-ups yet"
            body="Enter the litres and price per litre from a receipt. That total is cash for the week of the fill-up date."
            actions={
              <Button type="button" className="h-8 px-3" onClick={() => openFuel()}>
                Log fill-up
              </Button>
            }
          />
        )}
      </section>
    </div>
  )
}
