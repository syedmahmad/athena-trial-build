import type { WhiteboardStep } from "@/types/whiteboard";

export type LayoutResult = {
  stepId: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

const LEFT_MARGIN = 50;
const INDENT_SIZE = 40;
// Default content-coordinate width. The board (writable area) is this
// minus a LEFT_MARGIN on each side, so the historical 900-wide board
// corresponds to a 1000-unit content space. Callers can pass a smaller
// `contentWidth` (e.g. the narrow tutor-takeover panel) to reflow the
// same steps onto a tighter board — content then renders larger because
// whiteboard-canvas scales by renderedWidth / contentWidth.
const DEFAULT_CONTENT_WIDTH = 1000;
const GAP = 16;
const TOP_PADDING = 30;

const FONT_HEIGHT: Record<string, number> = {
  sm: 20,
  md: 28,
  lg: 36,
  xl: 48,
};

/** Estimate the height of a step's action for layout purposes. */
function estimateHeight(action: WhiteboardStep["action"], boardWidth: number): number {
  switch (action.type) {
    case "write_text": {
      const lineH = FONT_HEIGHT[action.style?.fontSize ?? "md"];
      const fSize = { sm: 14, md: 18, lg: 24, xl: 32 }[action.style?.fontSize ?? "md"] ?? 18;
      const avgCw = fSize * 0.55;
      const maxChars = Math.max(10, Math.floor(boardWidth / avgCw));
      let totalLines = 0;
      for (const segment of (action.text ?? "").split("\n")) {
        if (!segment) { totalLines++; continue; }
        const words = segment.split(" ");
        let cur = "";
        for (const w of words) {
          const test = cur ? `${cur} ${w}` : w;
          if (test.length > maxChars && cur) { totalLines++; cur = w; }
          else cur = test;
        }
        if (cur) totalLines++;
      }
      return lineH * Math.max(1, totalLines);
    }
    case "write_math":
      return 70; // overridden by measuredHeights when available
    case "draw_shape":
      return action.height ?? 120;
    case "coordinate_plane":
      return 500;
    case "geometry":
      return action.height ?? 300;
    case "number_line":
      return 80;
    case "table": {
      const rowCount = action.rows?.length ?? 0;
      return 30 + 28 * rowCount;
    }
    case "callout":
      // Generous starting height; the renderer reports the measured
      // height back via onMeasure once the body has wrapped.
      return 110;
    case "image":
      // Initial estimate; the renderer reports the real height via
      // onMeasure once the image has loaded.
      return action.height ?? 280;
    case "section_heading":
      // Heading + optional subtitle + padding + bottom rule. Measured
      // height comes back via onMeasure after the heading wraps.
      return action.subtitle ? 80 : 56;
    case "word_problem": {
      // Rough starter — gets superseded by measuredHeights once the
      // renderer reports its DOM height back via onMeasure. The
      // estimate just needs to be in the right ballpark so the
      // initial layout pass doesn't stack the next step over the top
      // of the card.
      const proseLines = Math.ceil((action.prose?.length ?? 0) / 80) || 1;
      const varRows = action.variables?.length ?? 0;
      return 90 + proseLines * 22 + varRows * 22 + 60;
    }
    // Rendered in left panel, not on canvas
    case "predict":
    case "fill_blank":
    case "pulse_check":
      return 0;
    // Non-visual actions
    case "highlight":
    case "erase":
    case "clear":
      return 0;
    default:
      return 0;
  }
}

/** Does the step occupy visual space on the board? */
function isContentStep(action: WhiteboardStep["action"]): boolean {
  return action.type !== "highlight" && action.type !== "erase" && action.type !== "clear" && action.type !== "check_in" && action.type !== "predict" && action.type !== "fill_blank" && action.type !== "pulse_check";
}

/** Does the step use the new auto-layout system (no legacy position field)? */
function isAutoLayout(action: WhiteboardStep["action"]): boolean {
  if (action.type === "write_text" || action.type === "write_math") {
    return !action.position;
  }
  if (action.type === "draw_shape") {
    return !!(action as { align?: string }).align || !!(action as { indentLevel?: number }).indentLevel;
  }
  // New element types are always auto-layout
  if (
    action.type === "coordinate_plane" ||
    action.type === "geometry" ||
    action.type === "number_line" ||
    action.type === "table" ||
    action.type === "callout" ||
    action.type === "image" ||
    action.type === "section_heading" ||
    action.type === "word_problem"
  ) {
    return true;
  }
  return false;
}

/**
 * Compute layout positions for all visible steps.
 *
 * Auto-layout steps stack vertically. Legacy steps with position fields
 * fall back to percentage-based absolute positioning.
 */
export function computeLayout(
  steps: WhiteboardStep[],
  visibleStepIds: Set<number>,
  measuredHeights: Map<number, number>,
  options?: { equalScaleCoords?: boolean; hiddenStepIds?: Set<number>; contentWidth?: number },
): LayoutResult[] {
  const results: LayoutResult[] = [];
  let cursorY = TOP_PADDING;
  const hidden = options?.hiddenStepIds;
  const contentWidth = options?.contentWidth ?? DEFAULT_CONTENT_WIDTH;
  const boardWidth = contentWidth - 2 * LEFT_MARGIN;

  for (const step of steps) {
    if (!visibleStepIds.has(step.id)) continue;

    const { action } = step;

    // Explicitly hidden (e.g. STATE steps whose content was consumed by
    // the preceding COLLAPSE's simplify-morph) — zero-size slot.
    if (hidden?.has(step.id)) {
      results.push({ stepId: step.id, x: 0, y: 0, width: 0, height: 0 });
      continue;
    }

    // Non-visual actions get zero-size entries for lookup
    if (!isContentStep(action)) {
      results.push({ stepId: step.id, x: 0, y: 0, width: 0, height: 0 });
      continue;
    }

    // Legacy absolute positioning fallback
    if (!isAutoLayout(action)) {
      const pos = (action as { position?: { x: number; y: number } }).position;
      if (pos) {
        results.push({
          stepId: step.id,
          x: (pos.x / 100) * contentWidth,
          y: (pos.y / 100) * 600,
          width: contentWidth - (pos.x / 100) * contentWidth - 20,
          height: measuredHeights.get(step.id) ?? estimateHeight(action, boardWidth),
        });
        continue;
      }
    }

    // Auto-layout
    const indent = (action as { indentLevel?: number }).indentLevel ?? 0;
    const align = (action as { align?: string }).align ?? "left";
    const stepWidth = boardWidth - indent * INDENT_SIZE;

    // Coordinate planes lay out as a square by default — equal pixel
    // counts on each side so the plot reads as a "graph" rather than a
    // wide strip. WbCoordinatePlane's internal equalScale logic then
    // letterboxes the data within that square (empty padding on
    // whichever axis has the smaller span), keeping px-per-unit equal
    // on both axes regardless of the data range. Capped so it doesn't
    // dominate the viewport on narrow lessons and floored so a tall
    // ySpan doesn't squish to nothing.
    let height: number;
    if (action.type === "coordinate_plane") {
      const MAX_CP_SIZE = 560;
      const MIN_CP_SIZE = 360;
      height = Math.max(MIN_CP_SIZE, Math.min(MAX_CP_SIZE, stepWidth));
    } else {
      height = measuredHeights.get(step.id) ?? estimateHeight(action, boardWidth);
    }

    let x = LEFT_MARGIN + indent * INDENT_SIZE;
    if (align === "center") {
      x = (contentWidth - stepWidth) / 2;
    }

    // No vertical space is reserved for the step-to-step connector.
    // The canvas renders the arrow centered on the boundary between
    // steps so half overlaps the previous step's bottom and half
    // overlaps the next step's top — this keeps the layout dense
    // while still visually linking the steps.
    //
    // (Note: actual suppression of the connector ARROW for identify /
    // setup / coordinate_plane steps lives in whiteboard-canvas.tsx
    // in the Layer 0 render; this layout pass no longer reserves any
    // dedicated space regardless.)

    results.push({
      stepId: step.id,
      x,
      y: cursorY,
      width: stepWidth,
      height,
    });

    cursorY += height + GAP;
  }

  return results;
}

/** Get total board height from layout results. */
export function computeBoardHeight(layout: LayoutResult[]): number {
  if (layout.length === 0) return 600;
  let maxBottom = 0;
  for (const r of layout) {
    const bottom = r.y + r.height;
    if (bottom > maxBottom) maxBottom = bottom;
  }
  return Math.max(600, maxBottom + 40);
}

/** Look up layout for a specific step. */
export function getStepLayout(layout: LayoutResult[], stepId: number): LayoutResult | undefined {
  return layout.find((r) => r.stepId === stepId);
}

/** Look up layout by step index (order in layout results). */
export function getStepLayoutByIndex(
  layout: LayoutResult[],
  steps: WhiteboardStep[],
  targetStepIndex: number,
): LayoutResult | undefined {
  const targetStep = steps[targetStepIndex];
  if (!targetStep) return undefined;
  return layout.find((r) => r.stepId === targetStep.id);
}
