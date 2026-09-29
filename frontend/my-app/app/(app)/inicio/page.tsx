import type { Metadata } from "next";

import HomeScreen from "@/features/dashboard/components/home-screen";

export const metadata: Metadata = { title: "Inicio · SIGMA-FCEN" };

export default function HomePage() {
  return <HomeScreen />;
}
