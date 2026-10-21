import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function EmptyState({
  icon: Icon,
  title,
  body,
  actions,
  className,
}: {
  icon: LucideIcon
  title: string
  body: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-start gap-3 px-5 py-8 sm:px-6", className)}>
      <span className="grid size-10 place-items-center rounded-lg bg-secondary text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1 max-w-prose text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}
