import { addDays, formatISODate, startOfWeek } from "@/lib/dates"
import { roundMoney } from "@/lib/format"
import type { Shift, Snapshot } from "@/lib/types"

const TEMPLATES: Omit<Shift, "id" | "date">[] = [
  {
    start: "11:00",
    end: "15:30",
    earnings: 118.2,
    kilometres: 51,
    orders: 8,
    area: "Sample · midday",
    note: "Illustration only. Not a real payout.",
  },
  {
    start: "16:45",
    end: "21:00",
    earnings: 154.75,
    kilometres: 63,
    orders: 12,
    area: "Sample · dinner",
    note: "Illustration only. Not a real payout.",
  },
  {
    start: "10:30",
    end: "14:15",
    earnings: 126.4,
    kilometres: 47,
    orders: 9,
    area: "Sample · lunch",
    note: "Illustration only. Not a real payout.",
  },
]

export function buildSample(today: Date): Snapshot {
  const todayIso = formatISODate(today)
  const weekStartIso = formatISODate(startOfWeek(today))
  const days: string[] = []
  for (let offset = 0; offset < 7; offset += 1) {
    const iso = addDays(weekStartIso, offset)
    if (iso <= todayIso) days.push(iso)
  }
  const chosen = days.slice(-TEMPLATES.length)
  const picked = TEMPLATES.slice(TEMPLATES.length - chosen.length)
  const shifts = chosen.map((date, index) => ({
    id: `sample-shift-${index + 1}`,
    date,
    ...picked[index],
  }))

  return {
    shifts,
    fuel: [
      {
        id: "sample-fuel-1",
        date: chosen[0] ?? todayIso,
        litres: 36,
        pricePerLitre: 1.62,
        total: roundMoney(36 * 1.62),
        station: "Sample station",
        odometer: null,
      },
    ],
    bills: [
      {
        id: "sample-bill-hydro",
        name: "Sample · hydro",
        amount: 64,
        dueDate: addDays(todayIso, -2),
        category: "housing",
        paid: false,
      },
      {
        id: "sample-bill-phone",
        name: "Sample · phone",
        amount: 79,
        dueDate: addDays(todayIso, 4),
        category: "phone",
        paid: false,
      },
      {
        id: "sample-bill-insurance",
        name: "Sample · car insurance",
        amount: 186.4,
        dueDate: addDays(todayIso, 12),
        category: "vehicle",
        paid: false,
      },
      {
        id: "sample-bill-parking",
        name: "Sample · parking pass",
        amount: 40,
        dueDate: addDays(todayIso, -10),
        category: "vehicle",
        paid: true,
      },
    ],
    settings: {
      displayName: "",
      province: "",
      weeklyIncomeTarget: 500,
      litresPer100km: 8.4,
      fuelPricePerLitre: 1.62,
    },
  }
}
