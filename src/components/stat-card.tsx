import { Numeric } from "@/components/numeric"
import { cn } from "@/lib/utils"

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  featured = false,
  className,
}: {
  label: string
  value: string
  hint: string
  tone?: "default" | "positive" | "warning"
  featured?: boolean
  className?: string
}) {
  return (
    <article
      className={cn(
        "rounded-2xl border border-border bg-card px-4 py-4 transition-colors hover:border-white/15 sm:px-5 sm:py-5",
        featured && "border-primary/35 bg-[linear-gradient(180deg,rgba(61,220,151,0.09),transparent_48%)]",
        className,
      )}
    >
      <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-3">
        <Numeric
          tone={tone}
          className={cn("text-[1.65rem] leading-none font-medium", featured && "text-[2rem]")}
        >
          {value}
        </Numeric>
      </p>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{hint}</p>
    </article>
  )
}
