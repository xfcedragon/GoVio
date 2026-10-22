import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-lg rounded-md border border-border bg-card px-4 py-4">
      <h1 className="text-base font-medium tracking-tight">That page is not in GoVio</h1>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">
        Use the sidebar to open a page in the ledger.
      </p>
      <Link
        href="/"
        className="mt-3 inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Back to overview
      </Link>
    </div>
  );
}
