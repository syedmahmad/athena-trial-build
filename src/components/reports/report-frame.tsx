"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Outer container for both report kinds. Sets `data-report-ready`
 * after first paint so the Playwright capture step can wait for it
 * before invoking `page.pdf()`. We also wait one rAF tick so Recharts
 * has time to size its ResponsiveContainer.
 */
export function ReportFrame({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const handle = window.requestAnimationFrame(() => {
      if (!cancelled) {
        // One more frame to let Recharts settle in its first layout pass.
        window.requestAnimationFrame(() => {
          if (!cancelled) setReady(true);
        });
      }
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(handle);
    };
  }, []);

  return (
    <div
      data-report-ready={ready || undefined}
      data-testid={ready ? "report-ready" : undefined}
      className="mx-auto flex min-h-[1056px] w-[816px] flex-col gap-6 bg-background p-12 font-sans text-foreground"
    >
      {children}
    </div>
  );
}
