import type { ClipboardEvent, MouseEvent } from "react";

/**
 * Spread onto a question/answer-choice wrapper to block casual copy-paste of
 * quiz content into an external AI chat. Not a hard boundary — devtools or a
 * phone screenshot still get around it — this just removes the "select text,
 * Ctrl+C, paste into ChatGPT" path for the common case.
 */
export const noCopyProps = {
  onCopy: (e: ClipboardEvent) => e.preventDefault(),
  onCut: (e: ClipboardEvent) => e.preventDefault(),
  onContextMenu: (e: MouseEvent) => e.preventDefault(),
  style: { userSelect: "none" as const, WebkitUserSelect: "none" as const },
};
