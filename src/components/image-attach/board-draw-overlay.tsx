"use client";

/**
 * In-canvas "Draw on the board" surface.
 *
 * Replaces the dialog-popup draw input: an ink layer drops directly
 * over the lesson/mentor board (the caller mounts this inside the
 * board's positioned container). The student handwrites an equation;
 * on Done the ink PNG is transcribed to LaTeX by the vision OCR
 * endpoint, then the ink strokes morph into the typeset "canvas font"
 * (KaTeX) of what they wrote. The recognized LaTeX is handed up via
 * `onRecognized` — the caller auto-sends it to the tutor.
 *
 * On-screen the ink is light-on-transparent over a dimmed board scrim
 * so it reads as writing ON the board; the EXPORT is composited
 * black-on-white inside `useStrokeCanvas.toPngBlob` for OCR accuracy.
 *
 * Failure (empty/garbage latex, network/timeout): fall back to redraw
 * or send-as-image (the original PNG through the existing vision
 * pipeline), so a misread never silently reaches the tutor.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import katex from "katex";
import { Check, Eraser, X as XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { recognizeHandwriting } from "@/lib/handwriting-ocr";
import { useStrokeCanvas } from "./sources/use-stroke-canvas";

type Phase = "drawing" | "reading" | "morphing" | "error";

type Props = {
  /** Recognized LaTeX (no `$` delimiters). Caller auto-sends it. */
  onRecognized: (latex: string) => void;
  /** Close/dismiss the overlay. */
  onClose: () => void;
  /** Fallback when OCR can't read the ink — hand the raw PNG to the
   *  caller's existing image-attach pipeline. */
  onAttachImage?: (blob: Blob) => void;
  /** Pause an always-listening VAD while drawing. */
  onSuppressVoice?: (suppressed: boolean) => void;
  /** Majordomo tagging context. */
  topic?: string;
  subtopic?: string;
  className?: string;
};

/** Probe whether a string is renderable LaTeX (rejects OCR garbage). */
function isValidLatex(latex: string): boolean {
  if (!latex) return false;
  try {
    katex.renderToString(latex, { throwOnError: true, displayMode: true });
    return true;
  } catch {
    return false;
  }
}

export function BoardDrawOverlay({
  onRecognized,
  onClose,
  onAttachImage,
  onSuppressVoice,
  topic,
  subtopic,
  className,
}: Props) {
  const { canvasRef, width, height, hasInk, inkVersion, clear, toPngBlob, handlers } =
    useStrokeCanvas({
      width: 1000,
      height: 440,
      // Light ink on transparent — the dimmed board shows through.
      palette: { ink: "oklch(0.96 0.005 80)", background: null },
    });

  const [phase, setPhase] = useState<Phase>("drawing");
  const [latex, setLatex] = useState("");
  const morphTargetRef = useRef<HTMLDivElement>(null);
  const lastBlobRef = useRef<Blob | null>(null);
  const closedRef = useRef(false);

  // ── Optimistic recognition ────────────────────────────────────────
  // As the student draws we OCR the current ink in the background
  // (cancelling stale in-flight requests on each new stroke), so the
  // result is usually in hand by the time they hit Done — the morph
  // then plays instantly instead of after a round-trip. A result is
  // keyed by `inkVersion`; we only reuse it when it matches the live
  // canvas, otherwise we await a fresh recognition.
  const inkVersionRef = useRef(inkVersion);
  inkVersionRef.current = inkVersion;
  // `latex: ""` means "recognized, but couldn't read it."
  const resultRef = useRef<{ version: number; latex: string } | null>(null);
  const inflightRef = useRef<{
    version: number;
    ac: AbortController;
    promise: Promise<string>;
  } | null>(null);

  const recognizeVersion = useCallback(
    (version: number): Promise<string> => {
      // Reuse an in-flight request for the same ink; abort any older one.
      if (inflightRef.current) {
        if (inflightRef.current.version === version) return inflightRef.current.promise;
        inflightRef.current.ac.abort();
        inflightRef.current = null;
      }
      const ac = new AbortController();
      const promise = (async () => {
        try {
          const blob = await toPngBlob();
          if (!blob) return "";
          lastBlobRef.current = blob;
          const raw = await recognizeHandwriting(blob, { topic, subtopic, signal: ac.signal });
          const valid = isValidLatex(raw) ? raw : "";
          resultRef.current = { version, latex: valid };
          return valid;
        } catch {
          // Aborted (superseded by a newer stroke) or network error —
          // don't cache; a later Done will re-request.
          return "";
        } finally {
          if (inflightRef.current?.ac === ac) inflightRef.current = null;
        }
      })();
      inflightRef.current = { version, ac, promise };
      return promise;
    },
    [toPngBlob, topic, subtopic],
  );

  // Background prefetch — debounced ~400ms after the student stops
  // drawing, so a flurry of quick strokes coalesces into one request.
  useEffect(() => {
    if (phase !== "drawing" || !hasInk) return;
    const version = inkVersion;
    // A new stroke supersedes any older in-flight recognition — cancel
    // it immediately rather than letting a stale request finish.
    if (inflightRef.current && inflightRef.current.version !== version) {
      inflightRef.current.ac.abort();
      inflightRef.current = null;
    }
    if (resultRef.current?.version === version) return; // already recognized
    const t = setTimeout(() => void recognizeVersion(version), 400);
    return () => clearTimeout(t);
  }, [phase, hasInk, inkVersion, recognizeVersion]);

  // Abort any in-flight request on unmount.
  useEffect(() => () => inflightRef.current?.ac.abort(), []);

  // Pause the VAD for the lifetime of the overlay.
  useEffect(() => {
    onSuppressVoice?.(true);
    return () => onSuppressVoice?.(false);
  }, [onSuppressVoice]);

  const cancel = useCallback(() => {
    closedRef.current = true;
    inflightRef.current?.ac.abort();
    onClose();
  }, [onClose]);

  // Escape cancels (aborting any in-flight OCR).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancel]);

  // Render the typeset morph target once we enter the morphing phase.
  useEffect(() => {
    if (phase !== "morphing" || !morphTargetRef.current) return;
    try {
      katex.render(latex, morphTargetRef.current, {
        throwOnError: false,
        displayMode: true,
        trust: true,
        strict: "ignore",
      });
    } catch {
      // Validity was already probed; this is belt-and-suspenders.
    }
  }, [phase, latex]);

  const finishWithLatex = useCallback((value: string) => {
    if (!value) {
      setPhase("error");
      return;
    }
    setLatex(value);
    setPhase("morphing");
  }, []);

  const handleDone = useCallback(async () => {
    const version = inkVersionRef.current;
    // Fast path: a fresh result for exactly this ink is already in hand.
    if (resultRef.current?.version === version) {
      if (!resultRef.current.latex && !lastBlobRef.current) {
        lastBlobRef.current = await toPngBlob();
      }
      finishWithLatex(resultRef.current.latex);
      return;
    }
    // Otherwise wait on the (possibly already in-flight) recognition.
    setPhase("reading");
    const value = await recognizeVersion(version);
    if (closedRef.current) return;
    finishWithLatex(value);
  }, [recognizeVersion, toPngBlob, finishWithLatex]);

  const handleSendAsImage = useCallback(async () => {
    const blob = lastBlobRef.current ?? (await toPngBlob());
    if (blob && onAttachImage) onAttachImage(blob);
    onClose();
  }, [onAttachImage, onClose, toPngBlob]);

  const handleRedraw = useCallback(() => {
    // Drop the cached miss so returning to drawing re-OCRs the same ink
    // (a retry can succeed) and lets new strokes prefetch afresh.
    resultRef.current = null;
    setPhase("drawing");
  }, []);

  return (
    <motion.div
      className={cn(
        "absolute inset-0 z-40 flex flex-col",
        // Dimmed, faintly blurred board so the ink reads as a focused
        // writing surface without fully hiding the lesson behind it.
        "bg-[var(--obs-bg)]/72 backdrop-blur-[2px]",
        className,
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* "Draw" label tab + cancel */}
      <div className="flex shrink-0 items-center justify-between px-5 pt-4">
        <span className="font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--obs-fg)]">
          Draw
        </span>
        <button
          type="button"
          onClick={cancel}
          title="Close (Esc)"
          aria-label="Close drawing"
          className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--obs-muted)] transition-colors hover:text-[var(--obs-fg)]"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Drawing / morph stage — canvas and KaTeX share the same box. */}
      <div className="relative min-h-0 flex-1 px-5 py-2">
        <div className="relative h-full w-full">
          <motion.canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="absolute inset-0 h-full w-full touch-none"
            style={{ pointerEvents: phase === "drawing" ? "auto" : "none" }}
            animate={
              phase === "morphing"
                ? { opacity: 0, scale: 0.96 }
                : { opacity: 1, scale: 1 }
            }
            transition={{ duration: 0.45, ease: "easeInOut" }}
            {...handlers}
          />

          {/* Hint baseline for the empty canvas. */}
          {phase === "drawing" && !hasInk && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="text-sm text-[var(--obs-muted)]">
                Write your equation here
              </span>
            </div>
          )}

          {/* Morph target — typeset KaTeX fades in as the ink dissolves. */}
          {phase === "morphing" && (
            <motion.div
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-[var(--obs-fg)]"
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45, ease: "easeInOut", delay: 0.1 }}
              onAnimationComplete={() => {
                onRecognized(latex);
                onClose();
              }}
            >
              <div ref={morphTargetRef} className="text-3xl" />
            </motion.div>
          )}

          {/* Reading state — pulsing label over the held ink. */}
          {phase === "reading" && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex items-center justify-center">
              <motion.span
                className="rounded-full bg-[var(--obs-surface)] px-3 py-1.5 text-xs text-[var(--obs-fg)]"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              >
                Reading your handwriting…
              </motion.span>
            </div>
          )}

          {/* Error state. */}
          <AnimatePresence>
            {phase === "error" && (
              <motion.div
                className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <span className="text-sm text-[var(--obs-fg)]">
                  Couldn&apos;t read that.
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleRedraw}
                    className="rounded-full border border-[var(--obs-border)] px-4 py-1.5 text-xs text-[var(--obs-fg)] transition-colors hover:border-[var(--obs-glow-mid)]"
                  >
                    Redraw
                  </button>
                  {onAttachImage && (
                    <button
                      type="button"
                      onClick={handleSendAsImage}
                      className="rounded-full bg-[var(--obs-glow-mid)] px-4 py-1.5 text-xs font-medium text-[var(--obs-bg)] transition-opacity hover:opacity-90"
                    >
                      Send as image
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Controls — only while actively drawing. */}
      {phase === "drawing" && (
        <div className="flex shrink-0 items-center justify-between px-5 pb-4">
          <button
            type="button"
            onClick={clear}
            disabled={!hasInk}
            className="flex items-center gap-1.5 rounded-full border border-[var(--obs-border)] px-3 py-1.5 text-xs text-[var(--obs-muted)] transition-colors hover:text-[var(--obs-fg)] disabled:opacity-40"
          >
            <Eraser className="h-3.5 w-3.5" />
            Clear
          </button>
          <button
            type="button"
            onClick={handleDone}
            disabled={!hasInk}
            className="flex items-center gap-1.5 rounded-full bg-[var(--obs-glow-mid)] px-4 py-1.5 text-xs font-medium text-[var(--obs-bg)] transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" />
            Done
          </button>
        </div>
      )}
    </motion.div>
  );
}
