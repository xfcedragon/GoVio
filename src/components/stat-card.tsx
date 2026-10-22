import { Numeric } from "@/components/numeric"
import { cn } from "@/lib/utils"

export type FigureTone = "default" | "positive" | "warning" | "muted"

export function FigureRow({
  items,
  columns = "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6",
}: {
  items: { label: string; value: string; hint?: string; tone?: FigureTone }[]
  columns?: string
}) {
  return (
    <dl className={cn("grid gap-x-5 gap-y-3", columns)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {item.label}
          </dt>
          <dd className="mt-1">
            <Numeric tone={item.tone ?? "default"} className="text-base leading-none">
              {item.value}
            </Numeric>
          </dd>
          {item.hint ? (
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{item.hint}</p>
          ) : null}
        </div>
      ))}
    </dl>
  )
}

export function LeadFigure({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string
  value: string
  hint?: string
  tone?: FigureTone
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <Numeric tone={tone} className="mt-1.5 block text-[1.75rem] leading-none sm:text-[2rem]">
        {value}
      </Numeric>
      {hint ? <p className="mt-2 max-w-xs text-xs leading-4 text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
