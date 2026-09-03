import type { ReactNode } from "react";

/**
 * The print-page layout overrides theme + chrome so the Playwright
 * capture sees a clean white surface regardless of the user's system
 * dark mode. We force the `light` class on the wrapper element rather
 * than the html tag (which is owned by the root layout) — Tailwind's
 * dark variant matches `.dark` on any ancestor, so light-by-default
 * just means absence of `.dark`.
 */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      {children}
    </div>
  );
}
