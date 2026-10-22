"use client"

import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export const controlClass =
  "h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"

export const textLinkClass =
  "text-foreground underline decoration-white/25 underline-offset-2 hover:decoration-foreground"

type ControlProps = {
  id?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  const describedBy = error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined
  const control =
    isValidElement(children)
      ? cloneElement(children as ReactElement<ControlProps>, {
          id: htmlFor,
          "aria-describedby": describedBy,
          "aria-invalid": error ? true : undefined,
        })
      : children

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {control}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs leading-5 text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function panelClass(className?: string) {
  return cn("rounded-md border border-border bg-card", className)
}
