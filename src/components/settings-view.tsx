"use client"

import { useState } from "react"
import Link from "next/link"
import { Field, controlClass } from "@/components/field"
import { PageHeader } from "@/components/page-header"
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
    settings.defaultPlatform,
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
  const [platform, setPlatform] = useState(settings.defaultPlatform)
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
      defaultPlatform: platform.trim() || "SkipTheDishes",
    })
    if (saved) notify("Settings saved")
  }

  return (
    <form onSubmit={save} className="max-w-xl space-y-4 rounded-md border border-border bg-card p-3">
      <h2 className="text-base font-semibold">Profile</h2>
      <Field label="Display name" htmlFor="settings-name" hint="Shown next to the date on Overview. Leave blank to skip it.">
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
        Used when Hourly Earnings estimates fuel consumed, and when a week has kilometres and no fill-up. A vehicle
        profile can store its own L/100 km for the tax records. This ledger rate stays here. The weekly pay target is
        edited on{" "}
        <Link href="/bills#weekly-target" className="text-foreground underline decoration-white/25 underline-offset-2 hover:decoration-foreground">
          Bills
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
      <Field label="Default delivery platform" htmlFor="settings-platform" hint="New shifts start with this. DoorDash, Uber Eats, SkipTheDishes, Instacart, or another app. Leave it blank to keep the built-in default.">
        <Input className="h-10" value={platform} maxLength={40} onChange={(event) => setPlatform(event.target.value)} />
      </Field>
      <Button type="submit" className="h-8 px-3">
        Save settings
      </Button>
    </form>
  )
}

export function SettingsView() {
  const { data, demo, requestSample, requestClearSample, requestClearAll } = useSkipPilot()

  const canClear = hasLedgerContent(data) || demo

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Name and province are labels. Fuel rates price estimated fuel consumed, and the week fuel figure when that week has no fill-up. Nothing here is uploaded."
      />

      <SettingsForm key={settingsKey(data.settings)} />

      <section className="max-w-xl rounded-md border border-border bg-card p-3">
        <h2 className="text-base font-semibold">Data in this browser</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          GoVio keeps the ledger in local storage. Receipt photos stay in this browser&apos;s IndexedDB.
          Clearing site data, or opening another browser, starts empty. There is no account and nothing syncs.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-8 px-3" onClick={requestSample}>
            {demo ? "Reload sample week" : "Preview sample week"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 px-3"
            disabled={!demo}
            onClick={requestClearSample}
          >
            Clear sample data
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-8 px-3"
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
