"use client";

// The SAT surface's progress view is the same component as the main app's
// /queue progress page — one source of truth, scoped to the SAT sections.
import { ProgressView } from "@/app/(protected)/queue/page";

export default function SatProgressPage() {
  return <ProgressView satOnly />;
}
