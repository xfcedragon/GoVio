import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPanel } from "@/components/auth-panel";
import { loadResetSession } from "@/lib/supabase/account";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Checking the reset link…</p>}>
      <ResetContent />
    </Suspense>
  );
}

async function ResetContent() {
  const session = await loadResetSession();
  return (
    <AuthPanel
      mode="reset"
      configured={session.configured}
      nextPath="/"
      error={null}
      notice={null}
      resetReady={session.sessionReady}
      resetEmail={session.email}
      resetBlockedMessage={session.message}
    />
  );
}
