"use client";

import type { ReactNode } from "react";

type Props = {
  bottomCenterLabel?: string;
  bottomRightLabel?: string;
  children: ReactNode;
};

const MONO =
  "font-mono uppercase tracking-[0.22em] text-[10px] text-[var(--obs-muted)]";

function Plus({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute select-none font-mono text-xs leading-none text-[var(--obs-muted)] opacity-70 ${className}`}
    >
      +
    </span>
  );
}

export function IsoContourFrame({
  bottomCenterLabel = "TOPOGRAPHY · ISO-CONTOUR FIELD",
  bottomRightLabel = "z = f(x, y)",
  children,
}: Props) {
  return (
    <div className="relative flex h-full w-full flex-col px-6 py-3">
      {/* Corner + markers */}
      <Plus className="left-2 top-1" />
      <Plus className="right-2 top-1" />
      <Plus className="left-2 bottom-1" />
      <Plus className="right-2 bottom-1" />

      {/* Content */}
      <div className="relative min-h-0 flex-1">{children}</div>

      {/* Bottom labels */}
      {(bottomCenterLabel || bottomRightLabel) && (
        <div className="flex items-center justify-between gap-4 pt-3">
          <span />
          <span className={MONO}>{bottomCenterLabel}</span>
          <span className={`${MONO} normal-case tracking-[0.18em]`}>
            {bottomRightLabel}
          </span>
        </div>
      )}
    </div>
  );
}
