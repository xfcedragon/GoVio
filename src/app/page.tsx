import type { Metadata } from "next";
import { Overview } from "@/components/overview";

export const metadata: Metadata = {
  title: { absolute: "Overview · GoVio" },
};

export default function Page() {
  return <Overview />;
}
