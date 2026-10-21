"use client"

import { useState } from "react"
import Link from "next/link"
import { Field, controlClass } from "@/components/field"
import { PageHeader } from "@/components/page-header"
import { PageSkeleton } from "@/components/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { parseDecimal } from "@/lib/parse"
import { hasLedgerContent } from "@/lib/storage"
import { useSkipPilot } from "@/lib/store"
import { PROVINCES, type ProvinceCode, type Settings } from "@/lib/types"

function settingsKey(settings: Settings) {
  return [
    settings.displayName,
    settings.province,
    settings.litresPer100km ?? "",
    settings.fuelPricePerLitre ?? "",
  ].join("|")
}

function SettingsForm() {
  const { data, updateSettings, notify } = useSkipPilot()
  const settings = data.settings
  const [name, setName] = useState(settings.displayName)
  const [province, setProvince] = useState<ProvinceCode | "">(settings.province)
  const [litres, setLitres] = useState(settings.litresPer100km === null ? "" : String(settings.litresPer100km))
  const [price, setPrice] = useState(
    settings.fuelPricePerLitre === null ? "" : String(settings.fuelPricePerLitre),
  )
  const [errors, setErrors] = useState<{ litres?: string; price?: string }>({})

  function save(event: React.FormEvent) {
    event.preventDefault()
    const nextErrors: { litres?: string; price?: string } = {}
    let litresValue: number | null = null
    let priceValue: number | null = null
    if (litres.trim()) {
      const parsed = parseDecimal(litres, 1)
      if (parsed === null || parsed <= 0 || parsed > 40) {
        nextErrors.litres = "Enter litres per 100 km, for example 8.4."
      } else {
        litresValue = parsed
      }
    }
    if (price.trim()) {
      const parsed = parseDecimal(price, 3)
      if (parsed === null || parsed <= 0 || parsed > 10) {
        nextErrors.price = "Enter a pump price per litre, for example 1.62."
      } else {
        priceValue = parsed
      }
    }
    setErrors(nextErrors)
    if (nextErrors.litres || nextErrors.price) return
    const saved = updateSettings({
      displayName: name.trim(),
      province,
      litresPer100km: litresValue,
      fuelPricePerLitre: priceValue,
    })
    if (saved) notify("Settings saved")
  }

  return (
    <form onSubmit={save} className="max-w-xl space-y-5 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold">Profile</h2>
      <Field label="Display name" htmlFor="settings-name" hint="Shown in the greeting. Leave blank to skip it.">
        <Input
          className="h-10"
          value={name}
          maxLength={40}
          autoComplete="nickname"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label="Province or territory" htmlFor="settings-province" hint="A label only. It does not change the math.">
        <select
          className={controlClass}
          value={province}
          onChange={(event) => setProvince(event.target.value as ProvinceCode | "")}
        >
          <option value="">Not set</option>
          {PROVINCES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>

      <h2 className="pt-2 text-base font-semibold">Vehicle assumption</h2>
      <p className="text-sm leading-6 text-muted-foreground">
        Used for a week with kilometres and no fill-up. The weekly pay target is edited on{" "}
        <Link href="/bills#weekly-target" className="text-primary hover:underline">
          Bills & Goals
        </Link>
        .
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fuel use (L/100 km)" htmlFor="settings-litres" error={errors.litres} hint="Blank clears it.">
          <Input
            className="h-10"
            inputMode="decimal"
            value={litres}
            onChange={(event) => setLitres(event.target.value)}
            placeholder="8.4"
          />
        </Field>
        <Field label="Pump price ($/L)" htmlFor="settings-price" error={errors.price} hint="Blank clears it.">
          <Input
            className="h-10"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="1.62"
          />
        </Field>
      </div>
      <Button type="submit" className="h-10 px-3.5">
        Save settings
      </Button>
    </form>
  )
}

export function SettingsView() {
  const { ready, data, demo, requestSample, requestClearSample, requestClearAll } = useSkipPilot()

  if (!ready) return <PageSkeleton cards={2} />

  const canClear = hasLedgerContent(data) || demo

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="This browser's ledger"
        description="Your name and province are labels. Fuel rates are used only when a week has no fill-up. Nothing here is uploaded."
      />

      <SettingsForm key={settingsKey(data.settings)} />

      <section className="max-w-xl rounded-2xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold">Data in this browser</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          SkipPilot keeps the ledger in local storage. Clearing site data, or opening another browser, starts empty.
          There is no account.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-10 px-3.5" onClick={requestSample}>
            {demo ? "Reload sample week" : "Preview sample week"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 px-3.5"
            disabled={!demo}
            onClick={requestClearSample}
          >
            Clear sample data
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-10 px-3.5"
            disabled={!canClear}
            onClick={requestClearAll}
          >
            Clear my ledger
          </Button>
        </div>
      </section>
    </div>
  )
}
