export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function roundKm(value: number): number {
  return Math.round(value * 10) / 10
}

export function formatCad(value: number): string {
  const negative = value < 0
  const [dollars, cents] = Math.abs(value).toFixed(2).split(".")
  const grouped = dollars.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return `${negative ? "−" : ""}$${grouped}.${cents}`
}

export function formatHours(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60))
  const wholeHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (wholeHours === 0) return `${minutes} min`
  if (minutes === 0) return `${wholeHours} h`
  return `${wholeHours} h ${minutes} min`
}

export function formatKm(kilometres: number): string {
  const rounded = roundKm(kilometres)
  const [whole, fraction] = rounded.toFixed(1).split(".")
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  const body = fraction === "0" ? grouped : `${grouped}.${fraction}`
  return `${body} km`
}

export function formatLitres(litres: number): string {
  return `${(Math.round(litres * 100) / 100).toFixed(2)} L`
}

export function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}
