import type { Metadata } from "next";

import HomeOverview from "@/features/auth/components/home-overview";

export const metadata: Metadata = { title: "Inicio · SIGMA-FCEN" };

export default function HomePage() {
  return <HomeOverview />;
}
