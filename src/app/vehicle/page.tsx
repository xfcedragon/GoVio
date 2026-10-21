import type { Metadata } from "next"
import { VehicleView } from "@/components/vehicle-view"

export const metadata: Metadata = {
  title: "Vehicle & Tax Records",
}

export default function VehiclePage() {
  return <VehicleView />
}
