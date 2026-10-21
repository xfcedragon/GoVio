import type { Metadata } from "next";
import { HourlyView } from "@/components/hourly-view";

export const metadata: Metadata = {
  title: "Hourly Earnings",
};

export default function HourlyPage() {
  return <HourlyView />;
}
