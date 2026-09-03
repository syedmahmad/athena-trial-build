import type { Metadata } from "next";
import "./sat.css";
import { SAT_BRAND } from "@/lib/sat/brand";

export const metadata: Metadata = {
  title: `${SAT_BRAND.name} · SAT Prep`,
  description: SAT_BRAND.description,
};

export default function SatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="sat-theme min-h-screen bg-background text-foreground">{children}</div>;
}
