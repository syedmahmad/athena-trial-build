// ── Layout ──────────────────────────────────────────────────────────

export type LayoutHint = {
  align?: "left" | "center";
  indentLevel?: number;
};

// ── Positions ───────────────────────────────────────────────────────

/** Absolute position (percentage 0-100 of board). Used by legacy steps. */
export type Position = { x: number; y: number };

/** Local coordinate within a figure's bounding box (0-100). */
export type LocalPoint = { x: number; y: number };

// ── Styles ──────────────────────────────────────────────────────────

export type TextStyle = {
  fontSize?: "sm" | "md" | "lg" | "xl";
  color?: string;
  fontWeight?: "normal" | "bold";
};

export type ShapeStyle = {
  strokeColor?: string;
  strokeWidth?: number;
  fillColor?: string;
  dashed?: boolean;
};

export type PointStyle = {
  color?: string;
  radius?: number;
  filled?: boolean;
};

export type CurveStyle = {
  strokeColor?: string;
  strokeWidth?: number;
  dashed?: boolean;
};

// ── Coordinate Plane ────────────────────────────────────────────────

export type CoordElement =
  | { type: "function"; points: [number, number][]; style?: CurveStyle; label?: string }
  | { type: "line"; from: [number, number]; to: [number, number]; style?: ShapeStyle; label?: string }
  | {
      type: "point";
      at: [number, number];
      /** Short text rendered close to the point — usually the numeric
       *  coordinates like "(0, 1)". */
      label?: string;
      /** Semantic callout drawn at the end of a leader line that points
       *  back at the marker. Use this for "y-intercept", "vertex",
       *  "minimum", etc. so the meaning of the point is visually
       *  separated from its coordinate label. */
      note?: { text: string; placement?: "ne" | "nw" | "se" | "sw" };
      style?: PointStyle;
    }
  | { type: "vertical_line"; x: number; style?: ShapeStyle; label?: string }
  | { type: "horizontal_line"; y: number; style?: ShapeStyle; label?: string };

export type CoordinatePlaneAction = {
  type: "coordinate_plane";
  xRange: [number, number];
  yRange: [number, number];
  elements: CoordElement[];
  showGrid?: boolean;
  axisLabels?: { x?: string; y?: string };
} & LayoutHint;

// ── Geometry ────────────────────────────────────────────────────────

export type GeoFigure =
  | { type: "polygon"; vertices: LocalPoint[]; style?: ShapeStyle; vertexLabels?: string[] }
  | { type: "circle"; center: LocalPoint; radius: number; style?: ShapeStyle }
  | { type: "ellipse"; center: LocalPoint; rx: number; ry: number; style?: ShapeStyle }
  | { type: "line_segment"; from: LocalPoint; to: LocalPoint; style?: ShapeStyle }
  // Diagram primitives — flowcharts, cycles, timelines, labeled structures.
  // `arrow` is a directed connector (optionally curved, optionally labeled);
  // `labeled_box` is a node with centered text.
  | {
      type: "arrow";
      from: LocalPoint;
      to: LocalPoint;
      style?: ShapeStyle;
      label?: string;
      curved?: boolean;
    }
  | {
      type: "labeled_box";
      center: LocalPoint;
      width: number;
      height: number;
      text: string;
      style?: ShapeStyle;
      textColor?: string;
    };

export type GeoLabel = {
  text: string;
  position: LocalPoint;
  fontSize?: number;
};

export type GeoAnnotation =
  | { type: "right_angle"; vertex: LocalPoint; size?: number }
  | { type: "angle_arc"; vertex: LocalPoint; from: LocalPoint; to: LocalPoint; label?: string }
  | { type: "dimension"; from: LocalPoint; to: LocalPoint; label: string; offset?: number }
  | { type: "tick_marks"; from: LocalPoint; to: LocalPoint; count: number };

export type GeometryAction = {
  type: "geometry";
  figures: GeoFigure[];
  labels?: GeoLabel[];
  annotations?: GeoAnnotation[];
  width?: number;
  height?: number;
} & LayoutHint;

// ── Number Line ─────────────────────────────────────────────────────

export type NumberLineAction = {
  type: "number_line";
  range: [number, number];
  tickInterval?: number;
  points?: { value: number; label?: string; style?: PointStyle }[];
  intervals?: {
    from: number;
    to: number;
    fromInclusive?: boolean;
    toInclusive?: boolean;
    color?: string;
  }[];
} & LayoutHint;

// ── Table ───────────────────────────────────────────────────────────

export type TableAction = {
  type: "table";
  headers: string[];
  rows: string[][];
  highlightCells?: { row: number; col: number; color?: string }[];
} & LayoutHint;

export type ImageAction = {
  type: "image";
  src: string;
  alt?: string;
  /** Attribution line shown under the image (required for CC-BY sources). */
  attribution?: string;
  /** Link to the source page (e.g. the Wikimedia Commons file description). */
  sourceUrl?: string;
  /** Optional short caption shown above the attribution. */
  caption?: string;
  height?: number;
  fit?: "contain" | "cover";
} & LayoutHint;

// ── Actions ─────────────────────────────────────────────────────────

export type CheckInAction = {
  type: "check_in";
  question: string;
  options: string[];
  correctOption: number;
  explanation: string;
  /** Nudge toward the method (shown after 1st wrong). */
  hint?: string;
  /** Walks through the thinking, leaving only the final step (shown after 2nd wrong). */
  detailedHint?: string;
  /** Optional whiteboard action shown on the canvas alongside the question. */
  visual?: WhiteboardAction;
  /** Visual shown on the canvas when hint is displayed (1st wrong answer). */
  hintVisual?: WhiteboardAction;
  /** Visual shown on the canvas when detailedHint is displayed (2nd wrong answer). */
  detailedHintVisual?: WhiteboardAction;
};

export type PredictAction = {
  type: "predict";
  question: string;
  options: string[];
  correctOption: number;
  explanation: string;
  hint?: string;
  /** Optional whiteboard action shown on the canvas alongside the question. */
  visual?: WhiteboardAction;
  /** Visual shown on the canvas when hint is displayed (1st wrong answer). */
  hintVisual?: WhiteboardAction;
};

export type FillBlankAction = {
  type: "fill_blank";
  /**
   * Displayed question above the input. Historically authored as
   * `prompt`; the c2-ir IR serializer also remaps its unified
   * `question` field to `prompt` for fill_blank emissions. The
   * fallback `question?` exists because production lessons emitted
   * before the serializer fix shipped have only `question`. Renderer
   * reads `prompt ?? question`.
   */
  prompt?: string;
  question?: string;
  acceptedAnswers: string[];
  explanation: string;
  /** Nudge toward the method (shown after 1st wrong). */
  hint?: string;
  /** Walks through the thinking, leaving only the final step (shown after 2nd wrong). */
  detailedHint?: string;
  /** Optional whiteboard action shown on the canvas alongside the question. */
  visual?: WhiteboardAction;
  /** Visual shown on the canvas when hint is displayed (1st wrong answer). */
  hintVisual?: WhiteboardAction;
  /** Visual shown on the canvas when detailedHint is displayed (2nd wrong answer). */
  detailedHintVisual?: WhiteboardAction;
};

/**
 * A soft, caring mid-TEACH "pulse check" — a low-stakes probe that
 * surfaces a misconception or subtlety the student is about to
 * encounter. UX-wise this is intentionally NOT a check_in/predict:
 *
 *  - EXACTLY 2 options. One is the "trap" (the natural-but-wrong
 *    answer the misconception produces); the other is the correct
 *    take.
 *  - No progressive scaffolding. No retry. No tutor takeover. No
 *    red wrong-state. A single click reveals an explanation for
 *    whichever option was picked, then the lesson advances.
 *  - Both options carry an explanation: `explanation` (shown when
 *    the correct option is picked, confirms the subtlety) and
 *    `trapExplanation` (shown when the trap is picked, validates
 *    the instinct then redirects).
 *  - Authored from the lesson brief's Common Mistakes; framing is
 *    "this is where most students slip — what do you think?",
 *    never "did you understand?".
 *
 * Lives inside the TEACH phase (preceded by ≥2 teaching steps,
 * followed by ≥1 teaching step), not as VERIFY/ASSESS. At most
 * one per section; ~2–3 per lesson when the brief gives us real
 * pitfall material.
 */
export type PulseCheckAction = {
  type: "pulse_check";
  question: string;
  /** Exactly 2 entries. correctOption indexes into this. */
  options: string[];
  correctOption: number;
  /** Shown when the student picks the CORRECT option — confirms what they spotted. */
  explanation: string;
  /** Shown when the student picks the TRAP option — validates the instinct, then redirects. */
  trapExplanation: string;
  /**
   * Short tag naming the misconception probed (e.g.
   * "sign-flip on distribution"). Metadata for the evaluator and
   * the flagged-issue sidebar; never shown to the student.
   */
  pitfallLabel?: string;
  /** Optional supporting visual shown alongside the question. */
  visual?: WhiteboardAction;
};

/**
 * A section heading — large prominent title that introduces a new part
 * of the lesson. Emitted at section boundaries (after a check_in /
 * predict / fill_blank, or at the very start of the lesson) so the
 * student knows what topic the upcoming section is about.
 *
 * Render: bold heading on its own row, optional muted subtitle line.
 * The text may contain `$...$` for inline KaTeX so a formula can sit in
 * the heading.
 */
export type SectionHeadingAction = {
  type: "section_heading";
  text: string;
  /** Optional secondary line — context, lesson chunk number, etc. */
  subtitle?: string;
};

/**
 * Word-problem composite — renders as a single bounded card with three
 * labeled subsections (Word Problem, Define Variables, Equation Setup).
 * Owns its own layout: width is clamped by the canvas board width and
 * text wraps via CSS, so adding a new word-problem flavor can't drift
 * the layout. Subsequent solve steps continue as normal write_math
 * rows.
 *
 * Why this exists: word problems used to be emitted as ad-hoc
 * write_text + write_math sequences, and every new prose shape (long
 * sentences, multi-variable setups, embedded math) needed a one-off
 * layout patch. Forcing the canonical three-part structure through the
 * type system (and a single renderer) eliminates that maintenance
 * tax — a malformed word problem won't compile.
 */
export type WordProblemAction = {
  type: "word_problem";
  /** The problem statement as prose. May contain `$...$` for inline
   *  KaTeX (e.g. dollar amounts written `\$5`, variables `$x$`). */
  prose: string;
  /** One row per declared variable. `symbol` is the LaTeX symbol
   *  ("x", "p", "n"); `meaning` is the plain-English definition. */
  variables: { symbol: string; meaning: string }[];
  /** The equation that captures the problem, as LaTeX (no outer `$`). */
  equation: string;
};

export type CalloutAction = {
  /** A flow callout — sits in the canvas step stream like a teaching
   *  step but with accented chrome (left bar + eyebrow). Used for in-flow
   *  hints surfaced when the student gets a check_in / predict /
   *  fill_blank wrong. NOT used for chat (chat lives in an overlay). */
  type: "callout";
  /** Visual accent driving color + default eyebrow. */
  variant: "hint" | "detailed-hint" | "answer-correct" | "answer-incorrect";
  /** Override the default eyebrow ("HINT" / "DETAILED HINT" / etc.). */
  eyebrow?: string;
  /** Body text. May contain `$...$` for inline KaTeX. */
  body: string;
};

export type WhiteboardAction =
  // Existing (position field kept for backward compat, LayoutHint added)
  | ({ type: "write_text"; text: string; position?: Position; style?: TextStyle; reveal?: "word" | "line" } & LayoutHint)
  | ({ type: "write_math"; latex: string; position?: Position; style?: TextStyle } & LayoutHint)
  | ({ type: "draw_shape"; shape: "line" | "arrow" | "circle" | "rect"; points: (Position | LocalPoint)[]; style?: ShapeStyle; width?: number; height?: number } & LayoutHint)
  | { type: "highlight"; targetStepIndex?: number; targetStepId?: number; region?: { position: Position; width: number; height: number }; color: string }
  | { type: "erase"; targetStepIndices?: number[]; targetStepIds?: number[] }
  | { type: "clear" }
  // New
  | CoordinatePlaneAction
  | GeometryAction
  | NumberLineAction
  | TableAction
  | ImageAction
  | CalloutAction
  | SectionHeadingAction
  | WordProblemAction
  | CheckInAction
  | PredictAction
  | FillBlankAction
  | PulseCheckAction;

// ── Steps & Response ────────────────────────────────────────────────

/**
 * Semantic tag identifying the kind of operation a step performs.
 * Drives future per-operand animations (fade out cancelled terms,
 * slide in new operands, glow the target). Closed vocabulary so the
 * animation logic stays switchable and the prompt stays predictable.
 */
export type MicroLessonOperation =
  | "identify"
  | "setup"
  | "state"
  | "substitute"
  | "distribute"
  | "combine"
  | "add"
  | "subtract"
  | "multiply"
  | "divide"
  | "factor"
  | "simplify"
  | "plot"
  | "highlight"
  | "conclude";

/**
 * Phase of the three-phase APPLY -> COLLAPSE -> STATE rhythm. Used by the
 * evaluator to detect triplets explicitly rather than inferring them from
 * step proximity (which is brittle once narration / graphing / other steps
 * appear between phases).
 */
export type MicroLessonPhase = "apply" | "collapse" | "state";

/**
 * A cross-step arrow that physically connects a span inside the previous
 * step's equation to a span inside the current step's equation. Replaces
 * the default step-center thin arrow for this step. Author wraps both
 * source and target spans with matching \htmlClass{<id>}{...} in their
 * respective latex.
 */
export type IncomingArrow = {
  /** The htmlClass id of the source span in the previous rendered step. */
  fromSpanId: string;
  /** The htmlClass id of the target span in THIS step. Defaults to the
   *  first .op-new span when omitted. */
  toSpanId?: string;
  /** Optional stroke color. Defaults to the muted observation-record tone. */
  color?: string;
};

/**
 * A callout that points at a specific span inside a rendered math equation.
 * The author wraps the target in \htmlClass{<id>}{...} inside the step's
 * latex, then lists the matching id + label here. The renderer walks the
 * post-katex DOM, finds each id, and draws a leader line + label pointing
 * at the span.
 */
export type MathAnnotation = {
  /** Matches the htmlClass applied to the target span in the latex. */
  id: string;
  /** Short text shown at the end of the leader line ("slope", "y-intercept"). */
  label: string;
  /** Which side of the equation the callout sits on. Default "bottom". */
  side?: "top" | "bottom";
  /** Optional accent color for the leader line + label. Defaults to the
   *  muted observation-record text color. */
  color?: string;
};

export type WhiteboardStep = {
  id: number;
  delayMs: number;
  durationMs: number;
  narration?: string;
  displayText?: string;
  operation?: MicroLessonOperation;
  /**
   * The literal operand for operations that introduce a value (e.g. "3"
   * for a subtract step, "2" for a divide step). Used by the future
   * animation driver to, e.g., emphasize the same value across APPLY
   * and COLLAPSE steps. Undefined for structural ops (setup, simplify,
   * state, plot, etc.).
   */
  operand?: string;
  /**
   * Stable identifier shared across the three steps of one APPLY/COLLAPSE/STATE
   * triplet. Lets the adherence evaluator check triplet structure explicitly
   * (every apply has a matching collapse + state in the same group) rather
   * than guessing from step proximity. Omit for non-triplet teaching steps.
   */
  operationGroupId?: string;
  /** Which phase of the triplet this step is. Required when operationGroupId is set. */
  phase?: MicroLessonPhase;
  /**
   * Opt-out for genuinely trivial arithmetic ops where APPLY/COLLAPSE/STATE
   * would be condescending (e.g. "multiply by 1"). The evaluator won't
   * require a triplet for steps with compact: true, but tracks compactRate
   * so the model can't silently mark every op compact.
   */
  compact?: boolean;
  /**
   * Machine-checkable algebraic form for checkable math steps — plain text
   * like "2x + 3 = 7", not LaTeX. Used as the canonical input to the math
   * evaluator (equivalence + fidelity). Presentation still comes from the
   * action.latex field. Omit on non-equation steps (formulas, definitions,
   * graph labels).
   */
  exprBefore?: string;
  /** The algebraic form AFTER the step's operation has been applied. */
  exprAfter?: string;
  /**
   * Variable name to substitute into, used by the math evaluator's fidelity
   * check when the equation has multiple free symbols. Only meaningful on
   * substitute APPLY steps where the target variable is ambiguous.
   */
  substituteVar?: string;
  /**
   * Optional callouts that point at specific spans inside the step's
   * rendered equation. Each entry's `id` must match a \htmlClass{...}
   * wrapping inside the step's latex. Only applies to write_math steps.
   */
  annotations?: MathAnnotation[];
  /**
   * Draw an arrow from a named span in the previous rendered step to a
   * named span on this step. When present, replaces the default
   * step-center thin arrow for this step.
   */
  incomingArrow?: IncomingArrow;
  /**
   * Sequenced cross-fade animation for substitute APPLY steps that plug
   * 3+ variables in at once (slope formula, distance formula, quadratic
   * formula). The renderer first paints `fromLatex` (the formula with
   * variable names) then sequentially fades each `fromSpan` into its
   * paired `toSpan` from `action.latex` so the student sees one
   * variable replaced at a time. For 1- and 2-substitution cases use
   * `incomingArrow` + color match instead.
   *
   * @deprecated Use `flyInSubstitution` for new lessons. The cross-fade
   * is the visual subset of fly-in (when src and dst rects coincide), so
   * fly-in subsumes this. Kept for backwards compatibility while
   * existing lessons are migrated.
   */
  substitutionAnimation?: SubstitutionAnimation;
  /**
   * Fly-in substitution: values physically arc from their source step
   * (where they were defined) into the apply equation, replacing the
   * variable name on arrival. REQUIRED for substitutions of 2+ variables;
   * optional but encouraged for 1-variable plug-ins. Subsumes the older
   * `substitutionAnimation` cross-fade behavior.
   */
  flyInSubstitution?: FlyInSubstitution;
  /**
   * Roaming-orb pointing (?debug=orb). On a step that DISCUSSES a part of a
   * previously-drawn geometry shape, the orb walks to that part and pulses it.
   * `part` names a vertex label ("C"), a side as a vertex pair ("AB"), or a
   * label/dimension text on the shape ("13", "hypotenuse"); resolved to a point
   * by `resolveShapePart` in pen-tip.ts. `refStepId` points at the geometry
   * step holding the shape — when omitted, the most recent visible geometry
   * step is used. No-op if the shape isn't visible or the part doesn't resolve.
   */
  orbFocus?: { refStepId?: number; part: string };
  action: WhiteboardAction;
};

/** @deprecated Use `FlyInSubstitution`. */
export type SubstitutionAnimation = {
  /** LaTeX rendered FIRST (before any substitutions). Each
   *  `sequence[i].fromSpan` must appear here as `\htmlClass{<id>}{...}`. */
  fromLatex: string;
  /** Ordered cross-fade pairs. The renderer fades `fromSpan` (in
   *  fromLatex) to `toSpan` (in action.latex) one pair at a time, in
   *  array order. Both sides must occupy the same on-screen position
   *  so the value lands where the variable was. */
  sequence: Array<{ fromSpan: string; toSpan: string }>;
  /** Per-pair fade duration. Default 700ms. */
  fadeMs?: number;
  /** Gap between successive pair starts. Default 600ms — each fade
   *  has time to read as one variable being replaced before the next
   *  starts, with a slight overlap so the chain still feels fluid. */
  gapMs?: number;
};

/** Fly-in substitution: each value arcs from its source step's span
 *  (where it was defined) into the apply equation's variable position.
 *  Variable in fromLatex fades out as the value lands and fades in.
 *  Required for substitutions of 2+ variables — the cross-step travel
 *  is the cue that links each value to where it came from. */
export type FlyInSubstitution = {
  /** LaTeX rendered into the ghost layer with variables visible (the
   *  pre-flight visual). Each `pairs[i].fromSpan` MUST appear here as
   *  `\htmlClass{<fromSpan>}{...}`. */
  fromLatex: string;
  /** Ordered fly-in pairs; one per variable being replaced. */
  pairs: Array<{
    /** htmlClass id of the variable in `fromLatex` (e.g. "var-m"). */
    fromSpan: string;
    /** htmlClass id of the value in `action.latex` (e.g. "val-m").
     *  Must occupy the same on-screen position as `fromSpan` so the
     *  value lands where the variable was. */
    toSpan: string;
    /** htmlClass id of the source value in a previous step (e.g.
     *  "src-m"). If omitted, defaults to `"src-" + fromSpan.replace(/^var-/, "")`. */
    fromSrcSpanId?: string;
  }>;
  /** Flight duration per value, ms. Default 1900. */
  travelMs?: number;
  /** Gap between successive flights, ms.
   *  - In "sequential" mode (default): the breath between one pair
   *    landing and the next launching. Default 100.
   *  - In "parallel" mode: stagger overlap between launches. */
  staggerMs?: number;
  /** "sequential" (default — each pair flies completely before the
   *  next launches; one number at a time) or "parallel" (all launch
   *  with stagger overlap). */
  timing?: "sequential" | "parallel";
  /** "arc" (default, cubic bezier with vertical bow) or "linear". */
  path?: "arc" | "linear";
  /** CSS easing for the flight. Default cubic-bezier(0.34, 1.56, 0.64, 1)
   *  for slight overshoot bounce. */
  easing?: string;
};

export type WhiteboardResponse = {
  steps: WhiteboardStep[];
};

export type SelectedElement = {
  stepId: number;
  type: "write_text" | "write_math";
  content: string;
  /** true when content is a sub-term/word rather than the full step content */
  isTerm?: boolean;
};
