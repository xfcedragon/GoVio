import type { Metadata } from "next";
import { FuelView } from "@/components/fuel-view";

export const metadata: Metadata = {
  title: "Fuel",
};

export default function FuelPage() {
  return <FuelView />;
}
