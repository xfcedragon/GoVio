import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { AuthPanel } from "@/components/auth-panel";
import {
  destinationAfterAuth,
  firstQueryValue,
  isSupabaseConfigured,
  loginBanner,
  loginNotice,
} from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading sign-in…</p>}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const params = await searchParams;
  const configured = isSupabaseConfigured(process.env);
  return (
    <AuthPanel
      mode="login"
      configured={configured}
      nextPath={destinationAfterAuth(firstQueryValue(params.next))}
      error={configured ? loginBanner(firstQueryValue(params.error)) : null}
      notice={configured ? loginNotice(firstQueryValue(params.notice)) : null}
    />
  );
}
