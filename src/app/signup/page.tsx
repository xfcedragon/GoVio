import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { AuthPanel } from "@/components/auth-panel";
import { destinationAfterAuth, firstQueryValue, isSupabaseConfigured } from "@/lib/auth";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading account form…</p>}>
      <SignUpContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SignUpContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  return (
    <AuthPanel
      mode="signup"
      configured={isSupabaseConfigured(process.env)}
      nextPath={destinationAfterAuth(firstQueryValue(params.next))}
      error={null}
      notice={null}
    />
  );
}
