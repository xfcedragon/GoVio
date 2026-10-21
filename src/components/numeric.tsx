import { cn } from "@/lib/utils"

const tones = {
  default: "text-foreground",
  positive: "text-primary",
  warning: "text-warning",
  muted: "text-muted-foreground",
} as const

export function Numeric({
  children,
  className,
  tone = "default",
}: {
  children: React.ReactNode
  className?: string
  tone?: keyof typeof tones
}) {
  return (
    <span className={cn("font-mono tracking-tight tabular-nums", tones[tone], className)}>
      {children}
    </span>
  )
}
