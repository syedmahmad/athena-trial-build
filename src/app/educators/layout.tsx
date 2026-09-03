import type { Metadata } from "next";
import "./educators.css";

export const metadata: Metadata = {
  title: "Athena · Educators",
  description: "Create, assign, and grade homework with Athena.",
};

export default function EducatorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="edu-theme min-h-screen">{children}</div>;
}
