"use client";

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

type ObservationFrameProps = {
  /** Deprecated: kept for backwards compatibility, no longer rendered.
   *  The brand label was redundant with the floating orb caption. */
  brand?: string;
  /** Deprecated: same as brand — no longer rendered. */
  subtitle?: string;
  onBack?: () => void;
  /** Floating action(s) — historically rendered top-right; now floats
   *  bottom-right inside the frame so the top chrome can collapse to
   *  just the BACK button. */
  headerExtra?: ReactNode;
  children: ReactNode;
};

function CornerPlus({
  className,
  faint = false,
}: {
  className: string;
  faint?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute select-none font-mono text-sm leading-none text-[var(--obs-muted)] ${
        faint ? "opacity-40" : "opacity-70"
      } ${className}`}
    >
      +
    </span>
  );
}

export function ObservationFrame({
  onBack,
  headerExtra,
  children,
}: ObservationFrameProps) {
  return (
    <div className="observation-record relative flex h-screen flex-col overflow-hidden observation-grid-bg">
      {/* Ambient vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 38%, color-mix(in oklch, var(--obs-accent-deep) 16%, transparent), transparent 60%), radial-gradient(ellipse at center, transparent 30%, var(--obs-bg) 80%)",
        }}
      />

      {/* Viewport corner + markers */}
      <CornerPlus className="left-3 top-3" />
      <CornerPlus className="right-3 top-3" />
      <CornerPlus className="left-3 bottom-3" />
      <CornerPlus className="right-3 bottom-3" />
      <CornerPlus className="left-3 top-1/2 -translate-y-1/2" faint />
      <CornerPlus className="right-3 top-1/2 -translate-y-1/2" faint />

      {/* Top chrome — minimized: just the BACK affordance. The brand
          and subtitle labels were redundant with the orb caption and
          have been dropped. */}
      {onBack && (
        <div className="relative z-20 px-8 pt-3">
          <button
            onClick={onBack}
            className="flex w-fit items-center gap-1.5 font-mono text-xs uppercase tracking-[0.22em] text-[var(--obs-muted)] transition-colors hover:text-[var(--obs-fg)]"
          >
            <ChevronLeft className="h-4 w-4" />
            BACK
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col pb-4">
        {children}
      </div>

      {/* Floating action(s) — bottom-right, above the corner marker. */}
      {headerExtra && (
        <div className="pointer-events-auto absolute bottom-5 right-7 z-20">
          {headerExtra}
        </div>
      )}
    </div>
  );
}
