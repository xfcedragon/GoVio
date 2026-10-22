import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountSection } from "@/components/account-section";
import { SettingsView } from "@/components/settings-view";
import { loadAccount } from "@/lib/supabase/account";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <SettingsView
      account={
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading account…</p>}>
          <AccountLoader />
        </Suspense>
      }
    />
  );
}

async function AccountLoader() {
  const account = await loadAccount();
  return <AccountSection account={account} />;
}
