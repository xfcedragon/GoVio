import { cn } from "@/lib/utils"

export function EmptyState({
  title,
  body,
  actions,
  className,
}: {
  title: string
  body: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("px-3 py-4", className)}>
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      <p className="mt-1 max-w-prose text-sm leading-5 text-muted-foreground">{body}</p>
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}
