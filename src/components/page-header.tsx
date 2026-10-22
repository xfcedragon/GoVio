import { cn } from "@/lib/utils"

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-lg font-medium tracking-tight text-foreground">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

export function Section({
  id,
  title,
  action,
  children,
  className,
}: {
  id?: string
  title: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section id={id} className={cn("overflow-hidden rounded-md border border-border bg-card", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
