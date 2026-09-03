"use client";

/**
 * Paste-from-clipboard source. Renders nothing visible — just a
 * window-scoped paste listener active while the parent passes
 * `active={true}`.
 *
 * Rationale for window-level capture: the Radix Dialog focus-traps,
 * so any focused element is inside the modal. Paste events bubble
 * to window from the focused element. Filtering by `active` keeps
 * us from stealing pastes when the modal is closed.
 *
 * Accepts only `image/*` items. Non-image pastes are silently
 * ignored — the user can still paste text into the textarea on the
 * review screen.
 */

import { useEffect } from "react";

type Props = {
  active: boolean;
  onFile: (file: File) => void;
};

export function PasteSource({ active, onFile }: Props) {
  useEffect(() => {
    if (!active) return;
    function handler(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          // Some pastes arrive as anonymous "image.png" blobs;
          // that's fine — the worker doesn't care about filename,
          // only MIME.
          e.preventDefault();
          onFile(file);
          return;
        }
      }
      // No image in the clipboard payload — quietly return. We
      // never called preventDefault, so a text paste into a
      // focused textarea still works normally.
    }
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [active, onFile]);
  return null;
}
