import { redirect } from "next/navigation";

import { MY_MONITORING_PATH } from "@/lib/auth";

/** Availability is managed inside each assignment of /mis-monitorias; old links land there. */
export default function AvailabilityPage() {
  redirect(MY_MONITORING_PATH);
}
