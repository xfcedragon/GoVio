import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-lg rounded-2xl border border-border bg-card px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">That page is not in SkipPilot</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        The ledger has Overview, Shifts, Fuel, Bills & Goals, and Settings.
      </p>
      <Link
        href="/"
        className="mt-5 inline-flex h-10 items-center rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
      >
        Back to overview
      </Link>
    </div>
  );
}
