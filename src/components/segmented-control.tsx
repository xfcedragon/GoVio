"use client"

import { cn } from "@/lib/utils"

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex max-w-full flex-wrap gap-0.5 rounded-md border border-border bg-background p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-sm px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground",
              selected && "bg-secondary text-foreground",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
