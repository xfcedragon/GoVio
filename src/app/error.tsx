"use client";

import { Button } from "@/components/ui/button";

export default function RouteError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="max-w-lg rounded-2xl border border-border bg-card px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">This screen did not load</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        The page failed to render. Entries already saved in this browser are still there.
      </p>
      <Button type="button" className="mt-5 h-10 px-3.5" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
