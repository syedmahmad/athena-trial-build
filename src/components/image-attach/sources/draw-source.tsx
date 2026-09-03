"use client";

/**
 * Hand-draw source (dialog tab) — pointer events on a <canvas>.
 *
 * The stroke-capture engine lives in `useStrokeCanvas`; this component
 * is just the dialog chrome around it. The canvas paints black-ink on
 * white to match the OCR model's preferred input distribution
 * (document-like inputs work best).
 *
 * Caveat: the vision OCR often misreads handwriting. The review screen's
 * edit textarea is the escape valve — accept that, fix it, move on.
 *
 * `<foreignObject>` doesn't apply here — the canvas lives in the modal,
 * not inside the whiteboard SVG. (The in-canvas variant is
 * `BoardDrawOverlay`, which shares the same engine.)
 */

import { Button } from "@/components/ui/button";
import { useStrokeCanvas } from "./use-stroke-canvas";

type Props = {
  onFile: (file: File) => void;
  onError?: (message: string) => void;
};

export function DrawSource({ onFile, onError }: Props) {
  const { canvasRef, width, height, hasInk, clear, toPngBlob, handlers } =
    useStrokeCanvas();

  async function handleUse() {
    const blob = await toPngBlob();
    if (!blob) {
      onError?.("Couldn't capture drawing.");
      return;
    }
    onFile(new File([blob], "drawing.png", { type: "image/png" }));
  }

  return (
    <div className="space-y-3">
      <div className="bg-white overflow-hidden rounded-lg border">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="block w-full touch-none"
          style={{ aspectRatio: `${width} / ${height}` }}
          {...handlers}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          Draw your equation above. (Handwriting accuracy is approximate
          — edit the result if needed.)
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={clear} disabled={!hasInk}>
            Clear
          </Button>
          <Button size="sm" onClick={handleUse} disabled={!hasInk}>
            Use drawing
          </Button>
        </div>
      </div>
    </div>
  );
}
