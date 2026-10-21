import type { Metadata } from "next";
import { Overview } from "@/components/overview";

export const metadata: Metadata = {
  title: { absolute: "Overview · SkipPilot" },
};

export default function Page() {
  return <Overview />;
}
