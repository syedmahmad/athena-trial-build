"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/** Close on Escape, shared by the educator panels and the full-screen editor. */
export function useEscapeClose(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, enabled]);
}

/** Full-screen page panel used by the educator surfaces (grading detail,
 *  student detail, settings, chat). Covers the viewport with its own header
 *  bar and a centered content column; Escape or the close button dismisses it.
 *  Content keeps the flex-column-with-height contract, so children that use
 *  `flex-1 overflow-y-auto` scroll inside the page as before. */
export function EduDrawer({
  title,
  label,
  width = "max-w-2xl",
  onClose,
  children,
  noPadding,
}: {
  title: string;
  /** Accessible name; defaults to title. */
  label?: string;
  width?: "max-w-md" | "max-w-lg" | "max-w-xl" | "max-w-2xl" | "max-w-3xl";
  onClose: () => void;
  children: React.ReactNode;
  noPadding?: boolean;
}) {
  useEscapeClose(onClose);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label ?? title}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-foreground/10 px-6 py-4">
        <div className="font-mono-hud hud-text text-foreground">{title}</div>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground/10 text-foreground/75 transition hover:border-foreground/30 hover:text-foreground"
          aria-label="Close"
        >
          <X size={15} />
        </button>
      </div>
      <div
        className={`mx-auto flex min-h-0 w-full flex-1 flex-col ${width} ${
          noPadding ? "" : "px-6 py-8"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
