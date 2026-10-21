import type { Metadata } from "next";

import RequireSession from "@/features/auth/session/require-session";
import MyReservations from "@/features/reservations/components/my-reservations";

export const metadata: Metadata = { title: "Mis reservas · SIGMA-FCEN" };

/**
 * Students see their bookings; monitors, the reservations on their slots (RF-045, RF-046).
 * The API returns only what involves the signed-in person (FASE-04 §5).
 */
export default function MyReservationsPage() {
  return (
    <RequireSession roles={["STUDENT", "MONITOR"]}>
      <MyReservations />
    </RequireSession>
  );
}
