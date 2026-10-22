import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { AuthPanel } from "@/components/auth-panel";
import { isSupabaseConfigured } from "@/lib/auth";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading password reset…</p>}>
      <ForgotContent />
    </Suspense>
  );
}

async function ForgotContent() {
  await connection();
  return (
    <AuthPanel
      mode="forgot"
      configured={isSupabaseConfigured(process.env)}
      nextPath="/"
      error={null}
      notice={null}
    />
  );
}
