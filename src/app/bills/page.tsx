import type { Metadata } from "next";
import { BillsView } from "@/components/bills-view";

export const metadata: Metadata = {
  title: "Bills & Goals",
};

export default function BillsPage() {
  return <BillsView />;
}
