"use client";

/**
 * Image-attach entry button.
 *
 * Light wrapper around the dynamic `<ImageAttachPanel />` — owns the
 * open state, renders a trigger button, and forwards `onAttach` /
 * `onSuppressVoice` to the panel.
 *
 * Two visual contexts in the app:
 *   - tutor-chat-bar: shadcn `<Button size="icon" variant="ghost">`
 *     to match the surrounding Mic / Send buttons. Default rendering.
 *   - mentor input row: raw rounded-full `<button>` elements with
 *     custom border tokens. Pass a `renderTrigger` callback to
 *     supply the trigger markup yourself.
 *
 * Default trigger uses Paperclip — reads as "attach an image to the
 * chat", not "this is a math feature".
 */

import { useEffect, useState, type ReactNode } from "react";
import { Paperclip, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImageAttachPanel } from "./index";

type Props = {
  /** Called with the captured image Blob when the user clicks Use.
   *  Caller typically stashes it as a pending attachment shown above
   *  the chat input, then includes it on the next sendChat call. */
  onAttach: (image: Blob) => void;
  /** Forwarded to the panel so it can pause an always-listening
   *  VAD while the user is interacting with the capture UI. */
  onSuppressVoice?: (suppressed: boolean) => void;
  /** Disable the trigger (e.g. while the chat is mid-processing). */
  disabled?: boolean;
  /** Custom trigger markup. Callback receives an `open()` fn.
   *  When omitted, renders the default shadcn ghost Button sized
   *  to match the chat-bar Mic button. */
  renderTrigger?: (open: () => void, disabled: boolean) => ReactNode;
  /** "full" (default) → paperclip, multi-source capture panel (upload /
   *  paste / camera / draw). "draw" → pencil, opens straight into a
   *  focused draw-your-equation canvas. Both feed the same Claude-vision
   *  pipeline. Mount one of each side-by-side for two entry points. */
  mode?: "full" | "draw";
};

export function ImageAttachLauncher({
  onAttach,
  onSuppressVoice,
  disabled = false,
  renderTrigger,
  mode = "full",
}: Props) {
  const [open, setOpen] = useState(false);
  const draw = mode === "draw";

  // ⌘/Ctrl + Shift + M opens the full capture panel. The draw launcher
  // gets no global shortcut: ⌘⇧D collides with Chrome's bookmark-all-tabs
  // and the pencil button is always visible anyway. Skipped while
  // disabled or already open.
  useEffect(() => {
    if (disabled || open || draw) return;
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && (e.key === "M" || e.key === "m")) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, open, draw]);

  const trigger = renderTrigger ? (
    renderTrigger(() => setOpen(true), disabled)
  ) : (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-9 w-9 shrink-0"
      onClick={() => setOpen(true)}
      disabled={disabled}
      title={draw ? "Draw an equation" : "Attach an image (⌘⇧M)"}
      aria-label={draw ? "Draw an equation" : "Attach an image"}
    >
      {draw ? <PenLine className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
    </Button>
  );

  return (
    <>
      {trigger}
      {/* Lazy-mount the panel only when open. Unmounting on close
          trades the Dialog's exit animation for a clean state reset
          between opens. */}
      {open && (
        <ImageAttachPanel
          open={open}
          onClose={() => setOpen(false)}
          onAttach={(image) => {
            onAttach(image);
            setOpen(false);
          }}
          onSuppressVoice={onSuppressVoice}
          initialMode={mode}
        />
      )}
    </>
  );
}
