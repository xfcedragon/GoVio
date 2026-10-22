"use client";

import { Button } from "@/components/ui/button";

export default function RouteError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="max-w-lg rounded-md border border-border bg-card px-4 py-4">
      <h1 className="text-base font-medium tracking-tight">This screen did not load</h1>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">
        The page failed to render. Entries already saved in this browser are still there.
      </p>
      <Button type="button" className="mt-3 h-8 px-3" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
