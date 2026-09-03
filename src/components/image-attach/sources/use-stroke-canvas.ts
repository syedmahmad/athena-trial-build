"use client";

/**
 * Shared pointer-stroke engine for the hand-draw inputs.
 *
 * No library — just `pointerdown` / `pointermove` / `pointerup` and a
 * stroke buffer replayed each frame. Two consumers share it:
 *   - `DrawSource` (the dialog tab) renders black-on-white to match the
 *     OCR model's preferred input distribution.
 *   - `BoardDrawOverlay` (the in-canvas surface) renders light ink on a
 *     transparent background so the dark board shows through and it
 *     reads as writing ON the board — but EXPORT is always composited
 *     black-on-white (`toPngBlob`) because the vision model reads that
 *     best. On-screen palette and export palette are decoupled.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type Point = { x: number; y: number; pressure: number };
export type Stroke = Point[];

export type StrokePalette = {
  /** Stroke color, any CSS color. */
  ink: string;
  /** Fill color, or `null` to clear (transparent) so a backdrop shows. */
  background: string | null;
};

const DEFAULT_W = 640;
const DEFAULT_H = 240;

// The canonical export palette — what the OCR model sees.
const EXPORT_PALETTE: StrokePalette = { ink: "#000000", background: "#ffffff" };

/** Paint a set of strokes onto a 2D context with the given ink color. */
function paintStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], ink: string) {
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    if (stroke.length < 2) {
      if (stroke.length === 1) {
        const p = stroke[0];
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5 * (p.pressure || 1), 0, Math.PI * 2);
        ctx.fill();
      }
      continue;
    }
    ctx.beginPath();
    for (let i = 0; i < stroke.length; i++) {
      const p = stroke[i];
      ctx.lineWidth = 2.5 * (p.pressure || 1);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

export type UseStrokeCanvasOptions = {
  width?: number;
  height?: number;
  /** On-screen render palette. Defaults to black-on-white. */
  palette?: StrokePalette;
};

export function useStrokeCanvas(opts: UseStrokeCanvasOptions = {}) {
  const width = opts.width ?? DEFAULT_W;
  const height = opts.height ?? DEFAULT_H;
  const palette = opts.palette ?? EXPORT_PALETTE;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  // Monotonic counter bumped whenever the committed ink changes (stroke
  // added or cleared). Consumers key optimistic recognition on it so a
  // cached result is only reused when it matches the current ink.
  const [inkVersion, setInkVersion] = useState(0);

  // Keep the latest palette in a ref so `repaint` (a stable callback)
  // always paints with current colors without re-creating handlers.
  const paletteRef = useRef(palette);
  paletteRef.current = palette;

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { ink, background } = paletteRef.current;
    if (background === null) ctx.clearRect(0, 0, canvas.width, canvas.height);
    else {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const all = currentStrokeRef.current
      ? [...strokesRef.current, currentStrokeRef.current]
      : strokesRef.current;
    paintStrokes(ctx, all, ink);
  }, []);

  // Paint the initial background once on mount and whenever palette flips.
  useEffect(() => {
    repaint();
  }, [repaint, palette.ink, palette.background]);

  const pointFromEvent = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): Point => {
      const rect = canvasRef.current!.getBoundingClientRect();
      // Convert client coords to canvas-internal coords accounting for
      // any CSS scaling.
      const sx = canvasRef.current!.width / rect.width;
      const sy = canvasRef.current!.height / rect.height;
      return {
        x: (e.clientX - rect.left) * sx,
        y: (e.clientY - rect.top) * sy,
        pressure: e.pressure || 0.5,
      };
    },
    [],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      canvasRef.current?.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      currentStrokeRef.current = [pointFromEvent(e)];
      repaint();
    },
    [pointFromEvent, repaint],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current || !currentStrokeRef.current) return;
      e.preventDefault();
      currentStrokeRef.current.push(pointFromEvent(e));
      repaint();
    },
    [pointFromEvent, repaint],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      e.preventDefault();
      canvasRef.current?.releasePointerCapture(e.pointerId);
      drawingRef.current = false;
      if (currentStrokeRef.current && currentStrokeRef.current.length > 0) {
        strokesRef.current.push(currentStrokeRef.current);
        setHasInk(true);
        setInkVersion((v) => v + 1);
      }
      currentStrokeRef.current = null;
      repaint();
    },
    [repaint],
  );

  const clear = useCallback(() => {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    setHasInk(false);
    setInkVersion((v) => v + 1);
    repaint();
  }, [repaint]);

  /** Export the captured strokes as a black-on-white PNG — what the OCR
   *  model reads, regardless of the on-screen palette. Painted to a
   *  detached canvas so the visible surface is untouched. */
  const toPngBlob = useCallback(async (): Promise<Blob | null> => {
    const off = document.createElement("canvas");
    off.width = width;
    off.height = height;
    const ctx = off.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = EXPORT_PALETTE.background!;
    ctx.fillRect(0, 0, width, height);
    paintStrokes(ctx, strokesRef.current, EXPORT_PALETTE.ink);
    return new Promise((resolve) => {
      off.toBlob((blob) => resolve(blob), "image/png", 0.95);
    });
  }, [width, height]);

  return {
    canvasRef,
    width,
    height,
    hasInk,
    inkVersion,
    repaint,
    clear,
    toPngBlob,
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
    },
  };
}
