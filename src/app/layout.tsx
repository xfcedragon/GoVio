import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { SignupVisitProvider } from "@/components/signup-visit";
import { SkipPilotProvider } from "@/lib/store";
import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-ibm",
  display: "swap",
});

const plex = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "GoVio",
    template: "%s · GoVio",
  },
  description:
    "A private earnings ledger for gig delivery drivers in Canada. Shifts, fuel, bills, and vehicle records stay in this browser.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-CA"
      className={`${sans.variable} ${plex.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <SkipPilotProvider>
          <SignupVisitProvider>
            <AppShell>{children}</AppShell>
          </SignupVisitProvider>
        </SkipPilotProvider>
      </body>
    </html>
  );
}
