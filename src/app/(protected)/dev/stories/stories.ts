import type { WhiteboardStep } from "@/types/whiteboard";

/**
 * A single "story" — a hand-crafted minimal lesson that exercises one step
 * type, operation, or connector/animation. Fed straight into the MicroLesson
 * renderer via existingLesson, with no DB tracking and no streaming.
 */
export type Story = {
  id: string;
  category: string;
  title: string;
  description: string;
  steps: WhiteboardStep[];
};

const COLOR = {
  purple: "#c084fc",
  red: "#f87171",
  amber: "#fbbf24",
  blue: "#60a5fa",
  emerald: "#34d399",
};

// ── Action types ────────────────────────────────────────────────────────

const writeText: Story = {
  id: "action-write-text",
  category: "Actions",
  title: "write_text",
  description: "Plain prose row. `reveal: 'word'` reveals one word at a time.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 2200,
      narration: "Linear equations are equations whose graphs are straight lines.",
      action: {
        type: "write_text",
        text: "Linear equations are equations whose graphs are straight lines.",
        reveal: "word",
        style: { fontSize: "md" },
      },
    },
  ],
};

const writeMath: Story = {
  id: "action-write-math",
  category: "Actions",
  title: "write_math",
  description: "KaTeX-rendered equation. Center-aligned, large.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 1600,
      operation: "setup",
      narration: "The slope-intercept form is y equals m x plus b.",
      displayText: "$y = mx + b$",
      action: {
        type: "write_math",
        latex: "y = mx + b",
        style: { fontSize: "xl" },
        align: "center",
      },
    },
  ],
};

const drawShape: Story = {
  id: "action-draw-shape",
  category: "Actions",
  title: "draw_shape (line / arrow / circle / rect)",
  description:
    "All four primitives in one story. Points are LocalPoint (0-100) mapped into the layout-engine's box (full board width × `action.height`).",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 1200,
      narration: "A line.",
      displayText: "Line",
      action: {
        type: "draw_shape",
        shape: "line",
        points: [
          { x: 5, y: 50 },
          { x: 95, y: 50 },
        ],
        style: { strokeColor: COLOR.amber, strokeWidth: 3 },
        height: 60,
      },
    },
    {
      id: 1,
      delayMs: 200,
      durationMs: 1200,
      narration: "An arrow.",
      displayText: "Arrow",
      action: {
        type: "draw_shape",
        shape: "arrow",
        points: [
          { x: 5, y: 50 },
          { x: 95, y: 50 },
        ],
        style: { strokeColor: COLOR.blue, strokeWidth: 3 },
        height: 60,
      },
    },
    {
      id: 2,
      delayMs: 200,
      durationMs: 1400,
      narration: "A circle.",
      displayText: "Circle",
      // Box is ~900 × 200. Center at (50%, 50%), edge at (+5.5%, +50%)
      // → rx ≈ 50px, ry ≈ 100px on screen reads as a near-round shape
      // once the canvas-scale fits things to the viewport.
      action: {
        type: "draw_shape",
        shape: "circle",
        points: [
          { x: 50, y: 50 },
          { x: 55.5, y: 100 },
        ],
        style: { strokeColor: COLOR.purple, strokeWidth: 2 },
        height: 200,
      },
    },
    {
      id: 3,
      delayMs: 200,
      durationMs: 1400,
      narration: "A rectangle.",
      displayText: "Rectangle",
      action: {
        type: "draw_shape",
        shape: "rect",
        points: [
          { x: 30, y: 15 },
          { x: 70, y: 85 },
        ],
        style: { strokeColor: COLOR.emerald, strokeWidth: 2 },
        height: 140,
      },
    },
  ],
};

const highlightStory: Story = {
  id: "action-highlight",
  category: "Actions",
  title: "highlight (overlay on prior step)",
  description: "Overlays a translucent colored box on the targeted step.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 1200,
      operation: "state",
      narration: "Two x plus three equals seven.",
      displayText: "$2x + 3 = 7$",
      action: { type: "write_math", latex: "2x + 3 = 7", style: { fontSize: "xl" }, align: "center" },
    },
    {
      id: 1,
      delayMs: 400,
      durationMs: 1400,
      narration: "Notice the constant on the left.",
      action: { type: "highlight", targetStepId: 0, color: COLOR.amber },
    },
  ],
};

const eraseClear: Story = {
  id: "action-erase-clear",
  category: "Actions",
  title: "erase / clear",
  description: "`erase` removes targeted steps. `clear` wipes everything.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 1000,
      operation: "state",
      narration: "First line.",
      displayText: "$a = 1$",
      action: { type: "write_math", latex: "a = 1", style: { fontSize: "lg" }, align: "center" },
    },
    {
      id: 1,
      delayMs: 200,
      durationMs: 1000,
      operation: "state",
      narration: "Second line.",
      displayText: "$b = 2$",
      action: { type: "write_math", latex: "b = 2", style: { fontSize: "lg" }, align: "center" },
    },
    {
      id: 2,
      delayMs: 800,
      durationMs: 1000,
      narration: "Erase the first one.",
      action: { type: "erase", targetStepIds: [0] },
    },
    {
      id: 3,
      delayMs: 1200,
      durationMs: 1000,
      narration: "And clear everything.",
      action: { type: "clear" },
    },
  ],
};

// ── Layout / structural ─────────────────────────────────────────────────

const sectionHeading: Story = {
  id: "action-section-heading",
  category: "Layout",
  title: "section_heading",
  description: "Bold prominent heading; optional subtitle. Used at section boundaries.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 1600,
      narration: "Slope-intercept form.",
      action: {
        type: "section_heading",
        text: "Slope-intercept form",
        subtitle: "How m and b control the line",
      },
    },
    {
      id: 1,
      delayMs: 200,
      durationMs: 1400,
      operation: "setup",
      displayText: "$y = mx + b$",
      action: { type: "write_math", latex: "y = mx + b", style: { fontSize: "xl" }, align: "center" },
    },
  ],
};

const wordProblem: Story = {
  id: "action-word-problem",
  category: "Layout",
  title: "word_problem (composite card)",
  description:
    "Single bordered card with three labeled subsections (Word Problem / Define Variables / Equation Setup). Replaces ad-hoc write_text + write_math sequences for real-world problems — layout is owned entirely by wb-word-problem.tsx with bounded width + CSS-enforced wrap, so adding a new problem flavor can't drift the layout.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 1600,
      narration:
        "Sarah is selling lemonade for two dollars a cup. She wants to earn forty dollars total. How many cups must she sell?",
      action: {
        type: "word_problem",
        prose:
          "Sarah is selling lemonade for \\$2 per cup. She wants to earn \\$40 in total. How many cups must she sell to reach her goal?",
        variables: [
          { symbol: "x", meaning: "the number of cups Sarah sells" },
        ],
        equation: "2x = 40",
      },
    },
    {
      id: 1,
      delayMs: 400,
      durationMs: 1400,
      operation: "setup",
      displayText: "Now we solve for $x$.",
      action: {
        type: "write_text",
        text: "Now we solve for x.",
        align: "center",
      },
    },
    {
      id: 2,
      delayMs: 300,
      durationMs: 1400,
      operation: "state",
      displayText: "$x = 20$",
      action: {
        type: "write_math",
        latex: "x = 20",
        style: { fontSize: "xl" },
        align: "center",
      },
    },
  ],
};

// Multi-variable example to stress the layout (longer prose, two
// variables, embedded math in meanings). Useful for catching wrap /
// overflow regressions in wb-word-problem.tsx.
const wordProblemMultiVar: Story = {
  id: "action-word-problem-multivar",
  category: "Layout",
  title: "word_problem (multi-variable, long prose)",
  description:
    "Stress test for wb-word-problem.tsx: longer prose, two variables, embedded LaTeX in meanings. Confirms the card's bounded width + overflowWrap: anywhere prevents clipping.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 1800,
      narration:
        "A coffee shop sells small drinks for three dollars and large drinks for five dollars. They sold a total of forty drinks for one hundred sixty dollars. How many of each were sold?",
      action: {
        type: "word_problem",
        prose:
          "A coffee shop sells small drinks for \\$3 each and large drinks for \\$5 each. They sold a total of 40 drinks for \\$160. How many of each size were sold?",
        variables: [
          { symbol: "s", meaning: "the number of small drinks sold" },
          { symbol: "\\ell", meaning: "the number of large drinks sold" },
        ],
        equation: "\\begin{cases} s + \\ell = 40 \\\\ 3s + 5\\ell = 160 \\end{cases}",
      },
    },
  ],
};

const calloutHint: Story = {
  id: "action-callout",
  category: "Layout",
  title: "callout (hint variant)",
  description: "Accented in-flow hint with eyebrow + body. Variants: hint, detailed-hint, answer-correct, answer-incorrect.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 1200,
      operation: "state",
      displayText: "$2x + 3 = 7$",
      action: { type: "write_math", latex: "2x + 3 = 7", style: { fontSize: "xl" }, align: "center" },
    },
    {
      id: 1,
      delayMs: 400,
      durationMs: 1600,
      narration: "Try isolating x by undoing the plus three.",
      action: {
        type: "callout",
        variant: "hint",
        body: "What's the first thing you'd undo to get $x$ alone?",
      },
    },
  ],
};

// ── Visualizations ──────────────────────────────────────────────────────

const coordinatePlane: Story = {
  id: "viz-coordinate-plane",
  category: "Visualizations",
  title: "coordinate_plane",
  description: "Function curve, points, vertical/horizontal lines, axis labels.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 2400,
      operation: "plot",
      narration: "Here is y equals two x plus one.",
      action: {
        type: "coordinate_plane",
        xRange: [-3, 3],
        yRange: [-3, 7],
        showGrid: true,
        axisLabels: { x: "x", y: "y" },
        elements: [
          {
            type: "function",
            points: Array.from({ length: 61 }, (_, i) => {
              const x = -3 + (i * 6) / 60;
              return [x, 2 * x + 1] as [number, number];
            }),
            style: { strokeColor: COLOR.blue, strokeWidth: 2 },
            label: "y = 2x + 1",
          },
          {
            type: "point",
            at: [0, 1],
            label: "(0, 1)",
            note: { text: "y-intercept", placement: "ne" },
            style: { color: COLOR.amber, filled: true, radius: 5 },
          },
        ],
      },
    },
  ],
};

const geometry: Story = {
  id: "viz-geometry",
  category: "Visualizations",
  title: "geometry (polygon + dimensions + right angle)",
  description: "Right triangle with leg dimensions and a right-angle marker.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 2400,
      operation: "setup",
      narration: "A right triangle with legs three and four.",
      action: {
        type: "geometry",
        width: 320,
        height: 240,
        figures: [
          {
            type: "polygon",
            vertices: [
              { x: 10, y: 90 },
              { x: 70, y: 90 },
              { x: 10, y: 30 },
            ],
            style: { strokeColor: COLOR.blue, strokeWidth: 2, fillColor: "rgba(96,165,250,0.1)" },
            vertexLabels: ["A", "B", "C"],
          },
        ],
        annotations: [
          { type: "right_angle", vertex: { x: 10, y: 90 }, size: 8 },
          { type: "dimension", from: { x: 10, y: 92 }, to: { x: 70, y: 92 }, label: "4" },
          { type: "dimension", from: { x: 8, y: 30 }, to: { x: 8, y: 90 }, label: "3" },
        ],
      },
    },
  ],
};

const numberLine: Story = {
  id: "viz-number-line",
  category: "Visualizations",
  title: "number_line",
  description: "Range with tick interval, labeled points, and an interval band.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 1800,
      operation: "plot",
      narration: "x is between negative two and three.",
      action: {
        type: "number_line",
        range: [-5, 5],
        tickInterval: 1,
        points: [
          { value: -2, label: "-2", style: { color: COLOR.red, filled: true } },
          { value: 3, label: "3", style: { color: COLOR.emerald, filled: false } },
        ],
        intervals: [
          { from: -2, to: 3, fromInclusive: true, toInclusive: false, color: COLOR.amber },
        ],
      },
    },
  ],
};

const tableStory: Story = {
  id: "viz-table",
  category: "Visualizations",
  title: "table (with highlightCells)",
  description: "Headers + rows. Cells can be highlighted by row/col index.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 1800,
      operation: "setup",
      narration: "Values of y for each x.",
      action: {
        type: "table",
        headers: ["$x$", "$y = 2x + 1$"],
        rows: [
          ["$0$", "$1$"],
          ["$1$", "$3$"],
          ["$2$", "$5$"],
        ],
        highlightCells: [{ row: 1, col: 1, color: COLOR.amber }],
      },
    },
  ],
};

// ── Operations + APPLY/COLLAPSE/STATE triplet ──────────────────────────

const triplet: Story = {
  id: "ops-triplet",
  category: "Operations",
  title: "APPLY → COLLAPSE → STATE triplet",
  description: "The canonical three-phase rhythm. Same operationGroupId across all three steps.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 1400,
      operation: "state",
      operationGroupId: "g0",
      phase: "state",
      exprBefore: "2x + 3 = 7",
      exprAfter: "2x + 3 = 7",
      narration: "Start with two x plus three equals seven.",
      displayText: "$2x + 3 = 7$",
      action: { type: "write_math", latex: "2x + 3 = 7", style: { fontSize: "xl" }, align: "center" },
    },
    {
      id: 1,
      delayMs: 300,
      durationMs: 1600,
      operation: "subtract",
      operand: "3",
      operationGroupId: "g1",
      phase: "apply",
      exprBefore: "2x + 3 = 7",
      exprAfter: "2x + 3 - 3 = 7 - 3",
      narration: "Subtract three from both sides.",
      displayText: "Subtract $3$ from both sides.",
      action: {
        type: "write_math",
        latex: "2x + \\htmlClass{op-cancel}{3} \\htmlClass{op-new}{- 3} = 7 \\htmlClass{op-new}{- 3}",
        style: { fontSize: "xl" },
        align: "center",
      },
    },
    {
      id: 2,
      delayMs: 200,
      durationMs: 1400,
      operation: "simplify",
      operationGroupId: "g1",
      phase: "collapse",
      exprBefore: "2x + 3 - 3 = 7 - 3",
      exprAfter: "2x = 4",
      narration: "Plus three minus three is zero on the left; seven minus three is four on the right.",
      action: {
        type: "write_math",
        latex: "2x = \\htmlClass{op-result}{4}",
        style: { fontSize: "xl" },
        align: "center",
      },
    },
    {
      id: 3,
      delayMs: 200,
      durationMs: 1200,
      operation: "state",
      operationGroupId: "g1",
      phase: "state",
      exprBefore: "2x = 4",
      exprAfter: "2x = 4",
      narration: "Two x equals four.",
      displayText: "$2x = 4$",
      action: { type: "write_math", latex: "2x = 4", style: { fontSize: "xl" }, align: "center" },
    },
  ],
};

// ── Connectors / animations ────────────────────────────────────────────

const incomingArrowStory: Story = {
  id: "anim-incoming-arrow",
  category: "Connectors",
  title: "incomingArrow (named span → named span)",
  description:
    "Cross-step arrow from a named source span to a named target span on the next write_math step. Two named-arrow examples chained together, each with its own color.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 1400,
      operation: "identify",
      narration: "Let x equal zero.",
      displayText: "Let $x = 0$",
      action: {
        type: "write_math",
        latex: "\\text{Let } \\htmlClass{src-x0}{\\textcolor{#60a5fa}{x = 0}}",
        style: { fontSize: "lg" },
        align: "center",
      },
    },
    {
      // Named arrow #1: src-x0 (step 0) → tgt-x0 (step 1). The arrow's
      // target span also carries op-new so the auto-target fallback
      // would have picked the same place — this is the canonical
      // "named span → named span" case.
      id: 1,
      delayMs: 400,
      durationMs: 1800,
      operation: "substitute",
      operand: "0",
      narration: "Substitute x equals zero into three x plus two y equals twelve.",
      displayText: "Substitute $x = 0$ into $3x + 2y = 12$.",
      incomingArrow: { fromSpanId: "src-x0", toSpanId: "tgt-x0", color: "#60a5fa" },
      action: {
        type: "write_math",
        latex:
          "3 \\cdot \\htmlClass{op-new tgt-x0}{\\textcolor{#60a5fa}{0}} + 2y = \\htmlClass{src-rhs}{\\textcolor{#fbbf24}{12}}",
        style: { fontSize: "xl" },
        align: "center",
      },
    },
    {
      // Named arrow #2: src-rhs (step 1) → tgt-rhs (step 2). The amber
      // 12 from the previous step travels into the right-hand side
      // here. Distinct color from arrow #1 so the two named arrows
      // read clearly as separate connectors.
      id: 2,
      delayMs: 400,
      durationMs: 1800,
      operation: "simplify",
      narration: "Three times zero is zero, so two y equals twelve.",
      displayText: "$2y = 12$",
      incomingArrow: { fromSpanId: "src-rhs", toSpanId: "tgt-rhs", color: "#fbbf24" },
      action: {
        type: "write_math",
        latex: "2y = \\htmlClass{op-new tgt-rhs}{\\textcolor{#fbbf24}{12}}",
        style: { fontSize: "xl" },
        align: "center",
      },
    },
  ],
};

const flyInSequential: Story = {
  id: "anim-flyin-sequential",
  category: "Connectors",
  title: "flyInSubstitution (sequential)",
  description: "Multi-variable plug-in: each value arcs from its source step into the variable's slot, one at a time.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 2000,
      operation: "identify",
      narration: "Label one comma two and four comma eight.",
      displayText: "$(x_1, y_1) = (1, 2)$  and  $(x_2, y_2) = (4, 8)$",
      action: {
        type: "write_math",
        latex:
          "(\\textcolor{#f87171}{x_1, y_1}) = (\\htmlClass{src-x1}{\\textcolor{#f87171}{1}}, \\htmlClass{src-y1}{\\textcolor{#f87171}{2}}) \\qquad (\\textcolor{#fbbf24}{x_2, y_2}) = (\\htmlClass{src-x2}{\\textcolor{#fbbf24}{4}}, \\htmlClass{src-y2}{\\textcolor{#fbbf24}{8}})",
        style: { fontSize: "lg" },
        align: "center",
      },
    },
    {
      id: 1,
      delayMs: 300,
      durationMs: 8500,
      operation: "substitute",
      compact: true,
      narration: "Plug the values into the slope formula one at a time.",
      displayText: "Plug values into $m = \\tfrac{y_2 - y_1}{x_2 - x_1}$.",
      flyInSubstitution: {
        fromLatex:
          "\\textcolor{#c084fc}{m} = \\frac{\\textcolor{#fbbf24}{\\htmlClass{var-y2}{y_2}} - \\textcolor{#f87171}{\\htmlClass{var-y1}{y_1}}}{\\textcolor{#fbbf24}{\\htmlClass{var-x2}{x_2}} - \\textcolor{#f87171}{\\htmlClass{var-x1}{x_1}}}",
        pairs: [
          { fromSpan: "var-x1", toSpan: "val-x1" },
          { fromSpan: "var-y1", toSpan: "val-y1" },
          { fromSpan: "var-x2", toSpan: "val-x2" },
          { fromSpan: "var-y2", toSpan: "val-y2" },
        ],
        timing: "sequential",
      },
      action: {
        type: "write_math",
        latex:
          "\\textcolor{#c084fc}{m} = \\frac{\\textcolor{#fbbf24}{\\htmlClass{op-new val-y2}{8}} - \\textcolor{#f87171}{\\htmlClass{op-new val-y1}{2}}}{\\textcolor{#fbbf24}{\\htmlClass{op-new val-x2}{4}} - \\textcolor{#f87171}{\\htmlClass{op-new val-x1}{1}}}",
        style: { fontSize: "xl" },
        align: "center",
      },
    },
  ],
};

const flyInParallel: Story = {
  id: "anim-flyin-parallel",
  category: "Connectors",
  title: "flyInSubstitution (parallel)",
  description: "Same as sequential but all values launch with stagger overlap.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 1800,
      operation: "identify",
      displayText: "Slope and y-intercept defined.",
      action: {
        type: "write_math",
        latex:
          "m = \\htmlClass{src-m}{\\textcolor{#c084fc}{2}} \\qquad b = \\htmlClass{src-b}{\\textcolor{#fbbf24}{1}}",
        style: { fontSize: "lg" },
        align: "center",
      },
    },
    {
      id: 1,
      delayMs: 300,
      durationMs: 4000,
      operation: "substitute",
      narration: "Plug m and b into y equals m x plus b.",
      flyInSubstitution: {
        fromLatex:
          "y = \\textcolor{#c084fc}{\\htmlClass{var-m}{m}}x + \\textcolor{#fbbf24}{\\htmlClass{var-b}{b}}",
        pairs: [
          { fromSpan: "var-m", toSpan: "val-m" },
          { fromSpan: "var-b", toSpan: "val-b" },
        ],
        timing: "parallel",
        staggerMs: 200,
      },
      action: {
        type: "write_math",
        latex:
          "y = \\textcolor{#c084fc}{\\htmlClass{op-new val-m}{2}}x + \\textcolor{#fbbf24}{\\htmlClass{op-new val-b}{1}}",
        style: { fontSize: "xl" },
        align: "center",
      },
    },
  ],
};

const distributionArrows: Story = {
  id: "anim-distribution-arrows",
  category: "Connectors",
  title: "distribution arrows (operation: distribute)",
  description:
    "Curved cubic beziers fan from a `.dist-src` span on the prior step out to each `.op-new` span on the distribute APPLY step. Renderer detects this automatically when `step.operation === 'distribute'` && `step.phase === 'apply'`.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 1800,
      operation: "setup",
      narration: "Two times the quantity x plus three.",
      displayText: "$2(x + 3)$",
      action: {
        type: "write_math",
        latex: "\\htmlClass{dist-src}{\\textcolor{#c084fc}{2}}(x + 3)",
        style: { fontSize: "xl" },
        align: "center",
      },
    },
    {
      id: 1,
      delayMs: 400,
      durationMs: 1800,
      operation: "distribute",
      operand: "2",
      operationGroupId: "g1",
      phase: "apply",
      exprBefore: "2*(x + 3)",
      exprAfter: "2*x + 2*3",
      narration: "Distribute the two across both terms inside.",
      displayText: "Distribute the $2$ across both terms.",
      action: {
        type: "write_math",
        latex:
          "\\htmlClass{op-new}{\\textcolor{#c084fc}{2}} \\cdot x + \\htmlClass{op-new}{\\textcolor{#c084fc}{2}} \\cdot 3",
        style: { fontSize: "xl" },
        align: "center",
      },
    },
  ],
};

const annotations: Story = {
  id: "anim-annotations",
  category: "Connectors",
  title: "math annotations (span → label callouts)",
  description: "Leader lines + labels pointing at named spans inside the equation.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 2400,
      operation: "setup",
      narration: "y equals m x plus b. m is the slope and b is the y-intercept.",
      displayText: "$y = mx + b$",
      action: {
        type: "write_math",
        latex:
          "y = \\htmlClass{ann-m}{\\textcolor{#c084fc}{m}}x + \\htmlClass{ann-b}{\\textcolor{#fbbf24}{b}}",
        style: { fontSize: "xl" },
        align: "center",
      },
      annotations: [
        { id: "ann-m", label: "slope", side: "bottom", color: COLOR.purple },
        { id: "ann-b", label: "y-intercept", side: "bottom", color: COLOR.amber },
      ],
    },
  ],
};

// ── Interactions ───────────────────────────────────────────────────────

const checkIn: Story = {
  id: "interact-check-in",
  category: "Interactions",
  title: "check_in",
  description: "Multiple-choice comprehension check. Hint on 1st wrong, tutor takeover on 2nd wrong.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 1200,
      operation: "state",
      displayText: "$3x + 5 = 14$",
      action: { type: "write_math", latex: "3x + 5 = 14", style: { fontSize: "xl" }, align: "center" },
    },
    {
      id: 1,
      delayMs: 400,
      durationMs: 0,
      narration: "What is the coefficient of x?",
      action: {
        type: "check_in",
        question: "In $3x + 5 = 14$, what is the coefficient of $x$?",
        options: ["$3$", "$5$", "$14$", "$x$"],
        correctOption: 0,
        explanation: "The coefficient is the number multiplying $x$.",
        hint: "Look at what number is sitting right next to the $x$.",
        detailedHint: "The coefficient is the multiplier on the variable — here that's the leading $3$.",
      },
    },
  ],
};

const predict: Story = {
  id: "interact-predict",
  category: "Interactions",
  title: "predict",
  description: "Predict the next move. Force-reveal on 2-option predicts goes straight to takeover.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 0,
      narration: "What should we do first to isolate x in two x plus three equals seven?",
      action: {
        type: "predict",
        question: "First step to isolate $x$ in $2x + 3 = 7$:",
        options: ["Subtract $3$ from both sides", "Divide both sides by $2$"],
        correctOption: 0,
        explanation: "Undo the addition before the multiplication so the constant disappears first.",
        hint: "Reverse the order of operations: undo the $+3$ before the $\\times 2$.",
      },
    },
  ],
};

const fillBlank: Story = {
  id: "interact-fill-blank",
  category: "Interactions",
  title: "fill_blank",
  description: "Free-form numeric/symbolic answer. Tutor takeover on 2nd wrong.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 0,
      narration: "Solve two x equals eight for x.",
      action: {
        type: "fill_blank",
        prompt: "If $2x = 8$, then $x = $ ___",
        acceptedAnswers: ["4"],
        explanation: "Divide both sides by $2$.",
        hint: "Undo the multiplication.",
        detailedHint: "$x = 8 \\div 2$.",
      },
    },
  ],
};

// ── Word-problem + interaction pairings ─────────────────────────────────
// Demonstrate the canonical flow: a structured word_problem card sets
// up the scenario, then an interaction (check_in / predict /
// fill_blank) asks the student to engage with it. The interaction
// shows in the bottom pane while the word_problem card stays
// visible on the canvas — same dual-surface pattern the live lesson
// uses.

const wordProblemCheckIn: Story = {
  id: "word-problem-check-in",
  category: "Interactions",
  title: "word_problem → check_in",
  description:
    "Word problem card on the canvas, multiple-choice question in the interaction pane asking which equation models the scenario.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 1800,
      narration:
        "A movie theater sells adult tickets for twelve dollars and child tickets for eight dollars. They sold one hundred tickets total and earned one thousand sixty dollars. How many of each type were sold?",
      action: {
        type: "word_problem",
        prose:
          "A movie theater sells adult tickets for \\$12 and child tickets for \\$8. They sold 100 tickets total and earned \\$1,060. How many adult tickets were sold?",
        variables: [
          { symbol: "a", meaning: "the number of adult tickets sold" },
          { symbol: "c", meaning: "the number of child tickets sold" },
        ],
        equation: "\\begin{cases} a + c = 100 \\\\ 12a + 8c = 1060 \\end{cases}",
      },
    },
    {
      id: 1,
      delayMs: 400,
      durationMs: 0,
      narration:
        "Which equation correctly captures the total revenue from both ticket types?",
      action: {
        type: "check_in",
        question:
          "Which equation correctly captures the total revenue from both ticket types?",
        options: [
          "$12a + 8c = 1060$",
          "$a + c = 1060$",
          "$12c + 8a = 1060$",
          "$20(a + c) = 1060$",
        ],
        correctOption: 0,
        explanation:
          "Each adult ticket contributes $\\$12$, each child ticket contributes $\\$8$, and the total is $\\$1,060$.",
        hint: "Multiply each ticket type by its price, then sum them.",
        detailedHint:
          "$12 \\cdot a$ is the adult revenue; $8 \\cdot c$ is the child revenue; their sum is the total.",
      },
    },
  ],
};

const wordProblemPredict: Story = {
  id: "word-problem-predict",
  category: "Interactions",
  title: "word_problem → predict",
  description:
    "Word problem card on the canvas, predict question in the pane asking the student which strategy to start with.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 1600,
      narration:
        "A bookstore offers a fifteen percent discount on a thirty dollar book. What is the final price?",
      action: {
        type: "word_problem",
        prose:
          "A bookstore offers a 15% discount on a \\$30 book. What is the final price after the discount is applied?",
        variables: [
          { symbol: "p", meaning: "the final price after the discount, in dollars" },
        ],
        equation: "p = 30 \\cdot (1 - 0.15)",
      },
    },
    {
      id: 1,
      delayMs: 400,
      durationMs: 0,
      narration:
        "What's the cleanest first move to find the final price?",
      action: {
        type: "predict",
        question:
          "What's the cleanest first move to find the final price?",
        options: [
          "Multiply $30$ by $0.85$",
          "Subtract $15$ from $30$",
        ],
        correctOption: 0,
        explanation:
          "Discounted price = original $\\times (1 -$ discount fraction $)$. Subtracting $15$ would treat the percentage as a dollar amount.",
        hint:
          "A 15% discount means you pay 85% of the original — express that as a multiplier.",
      },
    },
  ],
};

const wordProblemFillBlank: Story = {
  id: "word-problem-fill-blank",
  category: "Interactions",
  title: "word_problem → fill_blank",
  description:
    "Word problem card on the canvas, fill-in-the-blank for the final numeric answer.",
  steps: [
    {
      id: 0,
      delayMs: 0,
      durationMs: 1600,
      narration:
        "A taxi charges three dollars to start, plus two dollars for every mile. A ride costs nineteen dollars. How many miles was the ride?",
      action: {
        type: "word_problem",
        prose:
          "A taxi charges \\$3 to start the meter, plus \\$2 for every mile driven. A ride cost \\$19 total. How many miles was the ride?",
        variables: [
          { symbol: "m", meaning: "the number of miles driven" },
        ],
        equation: "2m + 3 = 19",
      },
    },
    {
      id: 1,
      delayMs: 400,
      durationMs: 0,
      narration: "How many miles was the ride? Enter the number of miles.",
      action: {
        type: "fill_blank",
        prompt: "$m = $ ___ miles",
        acceptedAnswers: ["8"],
        explanation:
          "Subtract the $\\$3$ flag-drop, leaving $\\$16$ in mileage charges. Divide by the $\\$2/$mile rate.",
        hint: "Isolate the mileage charge first, then divide by the per-mile rate.",
        detailedHint:
          "$2m + 3 = 19 \\rightarrow 2m = 16 \\rightarrow m = 8$.",
      },
    },
  ],
};

export const STORIES: Story[] = [
  // Actions
  writeText,
  writeMath,
  drawShape,
  highlightStory,
  eraseClear,
  // Layout
  sectionHeading,
  wordProblem,
  wordProblemMultiVar,
  calloutHint,
  // Visualizations
  coordinatePlane,
  geometry,
  numberLine,
  tableStory,
  // Operations
  triplet,
  // Connectors / animations
  incomingArrowStory,
  flyInSequential,
  flyInParallel,
  distributionArrows,
  annotations,
  // Interactions
  checkIn,
  predict,
  fillBlank,
  wordProblemCheckIn,
  wordProblemPredict,
  wordProblemFillBlank,
];

export const STORY_CATEGORIES = [
  "Actions",
  "Layout",
  "Visualizations",
  "Operations",
  "Connectors",
  "Interactions",
] as const;
