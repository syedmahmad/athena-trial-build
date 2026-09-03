"""
AI-driven Remotion primitive author.

Given a `_new` request from the brief generator (name + description +
use case + props schema), this module asks Claude (via tool-use) to
emit the full TypeScript source for a new primitive component
following the established style — SVG-based, "living" treatment
(shimmer + jitter + breath), uses `useCurrentFrame`, `useVideoConfig`,
`interpolate`, `Easing`, plus the `drawProgress` and `fadeOpacity`
helpers from `utils/timing.ts`.

3 existing primitives are loaded as in-context examples so Claude can
match the style. The output is a single .tsx file written to
`video-intro-remotion/src/primitives/<Name>.tsx`. The caller is
responsible for invoking `patchers.py` to register the primitive and
`sanity_render.py` to validate it compiles + renders.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import sys
from pathlib import Path as _Path

# `video_intro/` is sometimes invoked as a script (python -m video_intro …)
# from the agents/ dir; ensure `app.utils.llm_client` is importable in both
# cases. Same pattern as video_intro/brief_generator.py.
sys.path.insert(0, str(_Path(__file__).resolve().parent.parent))
from app.utils.llm_client import anthropic_client  # noqa: E402

from .config import Config  # noqa: E402

# Models come from Config.model_sketch / model_author (env vars
# VIDEO_INTRO_MODEL_SKETCH and VIDEO_INTRO_MODEL_AUTHOR, defaults to
# DEFAULT_MODEL in config.py). Sketch wants strongest reasoning (it's
# planning composition); author wants strong code (Sonnet sweet spot
# for TypeScript/React/SVG emission). Revise inherits model_author —
# same skill class as initial authoring.

# 3 reference primitives loaded as full source into the author + sketch
# prompts. Picked to demonstrate the applied / single-focal-point /
# recognizable-abstraction style we want — not just code-shape variety:
#
#  - SatelliteDish: applied single-focal-point with labeled marker
#    ("Focus"), dashed axis of symmetry, accent-colored converging rays.
#    Exact pattern we want the author reaching for.
#  - MedicalTestVisual: real-world-object abstraction (rapid test
#    cassette) with status text + accent color on the diagnostic line.
#    Shows how to render a recognizable physical object without
#    attempting photoreal detail.
#  - RationalFunctionPlot: two distinct shapes (camera viewfinder +
#    function curve) connected by a dashed line. Demonstrates how to
#    compose multi-part scenes that don't read as "unrelated objects".
#
# All three were authored by the three-phase pipeline and passed the
# vision critic. Promoted into the reference set so future author runs
# see the patterns that are actually working.
_REFERENCE_PRIMITIVES = ("SatelliteDish", "MedicalTestVisual", "RationalFunctionPlot")

PRIMITIVE_TOOL: dict[str, Any] = {
    "name": "emit_primitive_component",
    "description": (
        "Emit the full TypeScript source for a new Remotion primitive "
        "component. The component is a React function that takes a "
        "typed props object (matching the requested schema) plus "
        "`beatDurationFrames: number` and renders a self-contained SVG "
        "animation. Output must be ready to drop into "
        "video-intro-remotion/src/primitives/."
    ),
    "input_schema": {
        "type": "object",
        "required": [
            "component_name",
            "props_type_snippet",
            "source_tsx",
            "brief_doc",
        ],
        "properties": {
            "component_name": {
                "type": "string",
                "description": (
                    "PascalCase React component name. Must match the "
                    "filename (without .tsx). Will be exported as a "
                    "named export from the file."
                ),
            },
            "props_type_snippet": {
                "type": "string",
                "description": (
                    "Just the props fields, e.g. `x_range?: [number, "
                    "number]; tick_interval?: number;` — without the "
                    "outer braces and without the `primitive:` "
                    "discriminator. This snippet is used to extend "
                    "the CodePrimitive discriminated union in "
                    "manifest.ts."
                ),
            },
            "source_tsx": {
                "type": "string",
                "description": (
                    "Full source of the .tsx file. MUST include: imports "
                    "from 'remotion' (useCurrentFrame, useVideoConfig, "
                    "interpolate, Easing as needed); imports from "
                    "'../utils/timing' (drawProgress, fadeOpacity); the "
                    "exported function; props inline-typed including "
                    "`beatDurationFrames: number`. MUST be self-contained "
                    "(no React import needed for JSX in React 19, but "
                    "importing types from 'react' is OK)."
                ),
            },
            "brief_doc": {
                "type": "string",
                "description": (
                    "ONE-SENTENCE natural-language description of what "
                    "this primitive draws + a `Props: ...` enumeration "
                    "listing EVERY prop name you accept, with a brief "
                    "note on each. This string is spliced verbatim into "
                    "the brief-generator's system prompt so future brief "
                    "calls describe this primitive accurately. "
                    "Format must match existing entries exactly. "
                    "Example: 'horizontal bar-chart magnitude comparison. "
                    "Use for X-is-N-times-Y / ratio / proportion beats. "
                    "Props: bars:[{value, label, color?}], unit?, "
                    "show_ratio? (when true, displays simplified ratio at "
                    "the bottom).' "
                    "Anti-example: don't say 'see source for props' — "
                    "list the actual prop names you implemented."
                ),
            },
        },
    },
}

SYSTEM_PROMPT = """You are a Remotion primitive author for Athena's lesson-intro video pipeline. You write deterministic React/SVG components that animate at 30fps to a fixed beat duration. Each component produces white linework on transparent background (the composition stacks black underneath) and follows the established "living" treatment so videos feel organic, not frozen.

# The living treatment (non-negotiable for every primitive)

Three subtle motions layered on every visual element:

1. **Shimmer** — opacity oscillates slightly per-element with a per-element phase offset, e.g. `0.85 + 0.15 * Math.sin(tSec * 1.8 + idx * 0.31)`. Reads as "alive" without being distracting.
2. **Jitter** — sub-pixel translation per-element with offset, e.g. `jx = Math.cos(idx * 1.7 + tSec * 1.3) * 0.4`. Adds organic motion to particle fields and dense linework.
3. **Breath** (where appropriate) — row-or-element-level brightness wave over time, e.g. `0.55 + 0.22 * Math.sin(tSec * 0.9 - rowIdx * 0.18)`.

Static visuals are NEVER acceptable. Even an axes-only beat should have ticks staggered in over 220ms, axes drawn over 450ms with a glowing leading tip, and the grid pulsing subtly post-settle.

# Aesthetic

- Pure white linework. Use opacity, not color, for hierarchy. (Exceptions: `oklch(0.72 0.16 80)` — Athena amber — for "accent" elements like distribution arrows or highlighted strokes.)
- Black background is provided by the composition. Render with `fill="transparent"` outside and `stroke="white"` lines.
- Use `<filter id="...Glow">` blur+merge primitives for soft glow on lines and tips. See the existing primitives for the exact filter shape.
- KaTeX-rendered math overlays live in the OverlayLayer above the primitive — primitives draw shapes, axes, and bar charts; they do NOT render LaTeX directly.

# Composition (hard rules — your render will be visually critiqued)

These are not aesthetic preferences. A vision-based critic will look at your rendered frame and reject the primitive if it violates these. Treat them like a build check.

- **Single focal point.** Your primitive draws ONE thing the viewer's eye lands on, centered or rule-of-thirds positioned. Not three things scattered. If your spec implies multiple objects (e.g. a prescription pad AND a vial AND a doctor figure), pick the ONE most-readable representation and drop the rest. A clean single icon beats a busy composition every time.
- **No floating fragments.** If you draw a shape, its parts must be connected or visually related. No tiny disconnected dots or arcs in the corners of the canvas. No accent marks that look like leftover construction lines.
- **Stay inside the canvas.** Width/height come from `useVideoConfig()`. Use the centerX = width/2, centerY = height/2 anchoring pattern from the reference primitives. Don't position elements at coords that won't be visible on a typical 1280×720 frame — bounding box of your drawing should be at least 200px from any edge.
- **Recognizable abstractions over photoreal scenes.** Don't try to draw "a doctor" or "a satellite" as detailed figures — you'll fail. Draw a recognizable ABSTRACTION: a clipboard with text lines, a circular orbit with a labeled dot, a bar chart with units. Technical-illustration style, not editorial illustration.
- **Line weight conveys hierarchy.** Main shapes: stroke-width 2–3, full opacity. Supporting structure (grids, faint guides): stroke-width 1, opacity 0.3–0.5. Background elements: opacity 0.2. If everything is the same weight, the eye has nothing to follow.
- **When in doubt, simplify.** If you can't represent the application cleanly, fall back to a more abstract primitive: a labeled bar chart, a number line with markers, a single equation with annotations, a clean labeled diagram. A simple unambiguous visual is always better than a complex scene that reads as AI noise.

# Composition anti-patterns (instant rejection)

- Detailed human/animal figures drawn from primitives (stick figures attempted from rects and triangles will look like mashed shapes)
- Scenes with 3+ separate objects competing for attention
- Elements clipped by or extending past the canvas edge
- Rectangular outlines that contain illegible/garbled internal lines (e.g. a "prescription pad" with random horizontal strokes that don't spell anything)
- Shapes that look like other shapes by accident (a triangular fulcrum that reads as an exclamation mark; an oval that reads as an eye)
- Mixing 5+ unrelated icons in one frame to "tell a story" — that's the brief's job, not yours

# API contract

Every primitive's component:
- Is a named export from a `.tsx` file in `video-intro-remotion/src/primitives/`.
- Filename matches the component name (`CoordinateAxes.tsx` → `export function CoordinateAxes`).
- Takes a single props object whose fields match what the brief author requested.
- Includes `beatDurationFrames: number` as a (typically ignored — read it via `_beatDurationFrames` if you don't need it) prop.
- Uses `useCurrentFrame()` to get the frame index, `useVideoConfig()` for `width`, `height`, `fps`.
- Renders one `<svg>` with `position: absolute; inset: 0`, sized to the viewport.
- Imports the helpers `drawProgress` and `fadeOpacity` from `../utils/timing` for reveal animations.
- Does not render audio (the composition does that separately).
- Does not require any 3rd-party deps beyond what's already in `video-intro-remotion/package.json` (Remotion + React + KaTeX).

# Timing helpers

```typescript
import { drawProgress, fadeOpacity } from "../utils/timing";

// Returns 0..1 over [startMs, startMs + durationMs] with cubic ease-out.
drawProgress({ framesSinceBeatStart, fps, startMs, durationMs });

// Returns 0..1 opacity for a fade-in (and optional fade-out at disappear_s).
fadeOpacity({ framesSinceBeatStart, fps, appear_s, disappear_s, fadeMs });
```

Use these instead of raw `interpolate()` when possible — they capture the established cadence (350-500ms reveals, cubic easing).

# Output format

Emit the primitive via the `emit_primitive_component` tool. Include:
1. The full `source_tsx` — complete file, ready to write to disk.
2. The `component_name` in PascalCase (matches the filename).
3. The `props_type_snippet` — just the body of the props type, without outer braces or `primitive:` discriminator. This gets spliced into the discriminated union in manifest.ts.
4. The `brief_doc` — a ONE-sentence natural-language description of what your primitive draws, followed by a `Props: ...` enumeration of every prop you actually accept. This is spliced into the brief-generator's system prompt verbatim so future brief calls describe your primitive accurately. Format MUST match existing entries — read these for tone:
   - "horizontal bar-chart magnitude comparison. Use for X-is-N-times-Y / ratio / proportion beats. Props: bars:[{value, label, color?}], unit?, show_ratio? (when true, displays simplified ratio at the bottom)."
   - "animated sequence of coin flips with tally + optional probability label. Use for probability / sample-space beats. Props: outcomes:['H'|'T', ...], show_probability, flip_duration_ms, landing_dwell_ms."
   List every prop you implemented, with the exact names and types you used in the .tsx (do NOT paraphrase prop names — if you wrote `left_weight: number`, write `left_weight` in the doc, not "leftWeight" or "left weight"). If the doc disagrees with the .tsx the brief LLM will hallucinate wrong props on the next run.

Make it work the first time. Be deterministic. Don't include placeholders, TODOs, or stub logic — every prop in the schema must be honored, every animation timing must be specific. Use the reference primitives below for style + structure."""


@dataclass
class AuthoredPrimitive:
    component_name: str
    props_type_snippet: str
    source_tsx: str
    brief_doc: str


def author_primitive(
    *,
    name: str,
    description: str,
    use_case: str,
    props_schema: dict[str, Any],
    example_props: dict[str, Any],
    remotion_root: Path,
    config: Config | None = None,
) -> AuthoredPrimitive:
    """Single Claude call → emits a primitive component spec. Caller is
    responsible for writing the file + invoking the patchers + running
    the sanity-render harness.

    Raises RuntimeError if Claude doesn't return a tool call, or if the
    emitted source is malformed (no exported function matching the
    component_name).
    """
    cfg = config or Config.from_env()
    # cfg.require_anthropic() at import time asserts ANTHROPIC_API_KEY exists
    # so the helper has something to pass through to the gateway → Anthropic.
    cfg.require_anthropic()
    client = anthropic_client(feature="video-intro-primitive-author")

    references = _load_reference_primitives(remotion_root)
    timing_helpers = _load_timing_helpers(remotion_root)

    user_prompt = f"""Author a new Remotion primitive component.

# Spec

snake_case name: `{name}`
description: {description}
use case: {use_case}

props schema (TypeScript-like):
{json.dumps(props_schema, indent=2)}

example props the brief is passing at runtime:
{json.dumps(example_props, indent=2)}

# Reference primitives (study these for style + structure)

## timing.ts helpers
```typescript
{timing_helpers}
```

{references}

# Author the primitive

Emit the full .tsx via `emit_primitive_component`. The `component_name` should be PascalCase derived from `{name}` (e.g. `coordinate_axes` → `CoordinateAxes`). All fields in the props schema must be honored. The example props must render correctly.
"""

    response = client.messages.create(
        model=cfg.model_author,
        max_tokens=8000,
        system=SYSTEM_PROMPT,
        tools=[PRIMITIVE_TOOL],
        tool_choice={"type": "tool", "name": "emit_primitive_component"},
        messages=[{"role": "user", "content": user_prompt}],
    )

    tool_use = next(
        (b for b in response.content if getattr(b, "type", None) == "tool_use"),
        None,
    )
    if tool_use is None:
        raise RuntimeError(
            f"Claude did not emit a tool call. stop_reason={response.stop_reason}; "
            f"content blocks: {[getattr(b, 'type', '?') for b in response.content]}"
        )

    args = tool_use.input  # type: ignore[union-attr]
    component_name = args["component_name"]
    props_type_snippet = args["props_type_snippet"]
    source_tsx = args["source_tsx"]
    brief_doc = args["brief_doc"]

    if f"export function {component_name}" not in source_tsx and f"export const {component_name}" not in source_tsx:
        raise RuntimeError(
            f"emitted source does not export `{component_name}`. "
            f"Source preview: {source_tsx[:200]!r}"
        )

    return AuthoredPrimitive(
        component_name=component_name,
        props_type_snippet=props_type_snippet,
        source_tsx=source_tsx,
        brief_doc=brief_doc,
    )


def revise_primitive(
    *,
    name: str,
    component_name: str,
    previous_source: str,
    error_log: str,
    remotion_root: Path,
    config: Config | None = None,
) -> AuthoredPrimitive:
    """Re-prompt Claude with a previous failing attempt + the error log
    from sanity-render. Used by the retry loop in the orchestrator.

    Returns a new AuthoredPrimitive — the caller overwrites the .tsx
    and re-runs sanity-render.
    """
    cfg = config or Config.from_env()
    cfg.require_anthropic()
    client = anthropic_client(feature="video-intro-primitive-retry")

    references = _load_reference_primitives(remotion_root)
    timing_helpers = _load_timing_helpers(remotion_root)

    user_prompt = f"""The previous attempt at the `{name}` primitive (component `{component_name}`) failed to compile or render. Here is the failing source and the error log. Author a revised version that fixes the errors.

# Previous source (failing)

```typescript
{previous_source}
```

# Error log

```
{error_log[-3000:]}
```

# Reference primitives + helpers (for re-grounding)

## timing.ts helpers
```typescript
{timing_helpers}
```

{references}

# Author the revised primitive

Emit the full .tsx via `emit_primitive_component`. Keep the same `component_name` (`{component_name}`) and the same props schema you originally proposed. Fix the specific errors in the log — don't drift on style or behavior unnecessarily.
"""

    response = client.messages.create(
        model=cfg.model_author,
        max_tokens=8000,
        system=SYSTEM_PROMPT,
        tools=[PRIMITIVE_TOOL],
        tool_choice={"type": "tool", "name": "emit_primitive_component"},
        messages=[{"role": "user", "content": user_prompt}],
    )

    tool_use = next(
        (b for b in response.content if getattr(b, "type", None) == "tool_use"),
        None,
    )
    if tool_use is None:
        raise RuntimeError(
            f"Claude did not emit a tool call on revision. stop_reason={response.stop_reason}"
        )

    args = tool_use.input  # type: ignore[union-attr]
    return AuthoredPrimitive(
        component_name=args["component_name"],
        props_type_snippet=args["props_type_snippet"],
        source_tsx=args["source_tsx"],
        brief_doc=args["brief_doc"],
    )


def _load_reference_primitives(remotion_root: Path) -> str:
    """Load 3 reference primitive components as in-context examples."""
    parts: list[str] = []
    prim_dir = remotion_root / "src" / "primitives"
    for name in _REFERENCE_PRIMITIVES:
        path = prim_dir / f"{name}.tsx"
        if not path.is_file():
            continue
        parts.append(f"## {name}.tsx\n```typescript\n{path.read_text()}\n```")
    return "\n\n".join(parts)


def _load_timing_helpers(remotion_root: Path) -> str:
    """Load the timing.ts utility module so Claude sees the available helpers."""
    path = remotion_root / "src" / "utils" / "timing.ts"
    if not path.is_file():
        return "// timing.ts not found"
    return path.read_text()


def derive_pascal_case(snake_case: str) -> str:
    """`my_primitive_name` → `MyPrimitiveName`. Used as default if Claude
    forgets to PascalCase the component name."""
    return "".join(p.capitalize() for p in re.split(r"[_-]+", snake_case) if p)


# ──────────────────────────────────────────────────────────────────────────
# Three-phase authoring (sketch → static → living)
#
# The original `author_primitive` does everything in one LLM call: pick a
# composition, write static SVG, AND layer in the living treatment
# (shimmer/jitter/breath, fade-ins, draw progressions). Empirically that
# call has to juggle too many concerns at once — the result is primitives
# that compile but read as AI-art mess (broken figures, floating
# fragments) because the LLM was distracted writing animation code instead
# of getting the composition right.
#
# The three-phase pipeline separates concerns:
#   1. sketch_composition — text-only plan (focal point, shape inventory,
#      line weights) emitted BEFORE any code is written. Cheap, just
#      forces the LLM to commit to a layout up front.
#   2. author_primitive_static — writes a STATIC SVG matching the sketch.
#      No animation, no useCurrentFrame, no shimmer. Compiles + renders;
#      the visual critic checks composition quality at this phase.
#   3. author_primitive_living — takes the static .tsx and layers in
#      living treatment, draw progressions, fade-ins. The composition
#      is already approved; this phase only adds motion.
#
# Each phase has its own retry loop in __main__.py:_author_one_primitive,
# so failures isolate cleanly — a bad animation pass doesn't lose the
# good composition underneath it.
# ──────────────────────────────────────────────────────────────────────────


@dataclass
class CompositionSketch:
    """Pre-author composition plan. Emitted by sketch_composition and
    consumed by author_primitive_static."""

    focal_point: str
    shape_inventory: list[str]
    line_weight_plan: str
    animation_notes: str
    rationale: str

    def to_prompt_section(self) -> str:
        """Render the sketch as a prompt section the static author can
        read. Keep it scannable — bullets, not paragraphs."""
        shapes = "\n".join(f"- {s}" for s in self.shape_inventory)
        return f"""## Composition sketch (commit to this layout)

**Focal point**: {self.focal_point}

**Shape inventory** (canvas is 1280×720):
{shapes}

**Line-weight plan**: {self.line_weight_plan}

**Animation notes** (deferred to phase 2 — IGNORE in static authoring): {self.animation_notes}

**Rationale**: {self.rationale}
"""


SKETCH_TOOL: dict[str, Any] = {
    "name": "emit_composition_sketch",
    "description": (
        "Emit a static composition plan for a Remotion primitive BEFORE writing "
        "any code. The plan must commit to a specific layout — focal point, "
        "shape inventory in canvas coordinates, line-weight hierarchy — that "
        "the next phase will turn into static SVG."
    ),
    "input_schema": {
        "type": "object",
        "required": [
            "focal_point",
            "shape_inventory",
            "line_weight_plan",
            "animation_notes",
            "rationale",
        ],
        "properties": {
            "focal_point": {
                "type": "string",
                "description": (
                    "ONE sentence: where the eye lands and what's there. "
                    "Example: 'A horizontal bar chart of 3 route durations, "
                    "centered vertically, takes the full mid-screen.' "
                    "If you can't write a single-sentence focal point, "
                    "your composition is too busy — simplify."
                ),
            },
            "shape_inventory": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Each item is ONE shape with rough position and size. "
                    "Canvas is 1280×720. Use canvas coords. Examples: "
                    "'main rect 600×60 centered at (640, 360), filled "
                    "white at 0.85 opacity', 'label text \"Route A\" at "
                    "(200, 360), stroke white opacity 0.9, fontSize 24'. "
                    "Aim for 3-7 shapes total. More than that and the "
                    "composition is too busy for a 5s beat."
                ),
            },
            "line_weight_plan": {
                "type": "string",
                "description": (
                    "Which shapes are MAIN (stroke-width 2-3, opacity "
                    "0.85+) and which are SUPPORTING (stroke-width 1, "
                    "opacity 0.3-0.5). Example: 'Main: the three bars + "
                    "their values. Supporting: the axis tick marks and "
                    "label text. No background.'"
                ),
            },
            "animation_notes": {
                "type": "string",
                "description": (
                    "What should fade in / shimmer / breathe / draw "
                    "progressively. This is DEFERRED to phase 2 — the "
                    "static-author IGNORES these notes. Example: 'Bars "
                    "fill in left-to-right over 600ms, staggered by "
                    "150ms each. Labels fade in 200ms before each bar. "
                    "Subtle shimmer on the bar fill once landed.'"
                ),
            },
            "rationale": {
                "type": "string",
                "description": (
                    "Brief note (1-2 sentences) on WHY this composition "
                    "serves the spec. Helps the critic later if revision "
                    "is needed."
                ),
            },
        },
    },
}


SKETCH_SYSTEM_PROMPT = """You are a composition planner for the Athena lesson-intro video pipeline. You design the LAYOUT of Remotion primitives BEFORE any code is written.

Your job is to commit to a specific, simple, recognizable composition — a single focal point, 3-7 shapes with clear canvas positions, explicit line-weight hierarchy. The next phase (the static SVG author) will turn your plan into actual code; the phase after that will add animation. By forcing the layout decision UP FRONT, we prevent the author from getting distracted by animation and producing AI-art mess.

# What makes a good composition sketch

- **One thing**. The eye lands on ONE element. Not three. Not a busy "scene". If the spec implies 5 objects, pick the ONE most-readable representation and drop the rest.
- **Recognizable abstraction**. Don't try to plan "a doctor figure" or "a satellite" — those won't render cleanly. Plan recognizable diagrams: bar charts with units, circular orbits with labeled dots, clipboard with text lines, single icon centered.
- **Canvas coordinates**. Be specific. Canvas is 1280×720. Shapes positioned at (640, 360) are centered. Keep all content ≥ 200px from any edge.
- **3-7 shapes total**. More than 7 reads as busy. Fewer than 3 reads as empty.
- **Line-weight hierarchy**. Main shapes 2-3 stroke / 0.85+ opacity. Supporting 1 stroke / 0.3-0.5 opacity. Without hierarchy the eye has nothing to follow.
- **Animation deferred**. Note what should animate, but the static author will ignore that — they're focused on getting the picture right. Phase 2 picks the animations up.

# Anti-patterns (your sketch will be implemented literally, so don't plan these)

- Attempted human/animal figures (always read as garbled when drawn from primitives)
- 3+ unrelated objects (a vial AND a chart AND a doctor AND a syringe — pick one)
- Shapes positioned outside the canvas
- "Wireframe terrain" background or other atmospheric overlays unless the beat is explicitly atmospheric
- Vague descriptions ("some lines", "a figure") — be specific or your sketch is useless

Emit your plan via the `emit_composition_sketch` tool. The static-SVG author runs next and consumes your output literally — be deterministic."""


def sketch_composition(
    *,
    name: str,
    description: str,
    use_case: str,
    props_schema: dict[str, Any],
    example_props: dict[str, Any],
    remotion_root: Path,
    config: Config | None = None,
) -> CompositionSketch:
    """Pre-author composition plan. Returns CompositionSketch the
    subsequent author_primitive_static call consumes via
    sketch.to_prompt_section().

    The reference primitives are loaded as full source so the sketch
    can study their layouts — focal-point placement, line-weight
    hierarchy, how multi-part scenes are composed without reading as
    "unrelated objects". Without these, the sketch step would only see
    the prose system prompt and had to imagine what "good" looks like."""
    cfg = config or Config.from_env()
    cfg.require_anthropic()
    client = anthropic_client(feature="video-intro-primitive-sketch")

    references = _load_reference_primitives(remotion_root)

    user_prompt = f"""Sketch the composition for a new primitive.

# Spec

snake_case name: `{name}`
description: {description}
use case: {use_case}

props schema (TypeScript-like):
{json.dumps(props_schema, indent=2)}

example props the brief is passing at runtime:
{json.dumps(example_props, indent=2)}

# Reference primitives (study these for layout + focal-point patterns)

These are existing primitives that passed the vision critic. They demonstrate the kinds of layouts that work in this pipeline — recognizable abstractions, single focal point, line-weight hierarchy, labeled markers, accent-colored highlights. Plan a composition in the SAME style.

{references}

# Plan the composition

Emit via `emit_composition_sketch`. Pick the SIMPLEST recognizable composition that conveys what the spec describes — when in doubt, fall back to a labeled bar chart, a number line with markers, or a clean labeled diagram. A simple unambiguous visual always beats a complex scene."""

    response = client.messages.create(
        model=cfg.model_sketch,
        max_tokens=2000,
        system=SKETCH_SYSTEM_PROMPT,
        tools=[SKETCH_TOOL],
        tool_choice={"type": "tool", "name": "emit_composition_sketch"},
        messages=[{"role": "user", "content": user_prompt}],
    )

    tool_use = next(
        (b for b in response.content if getattr(b, "type", None) == "tool_use"),
        None,
    )
    if tool_use is None:
        raise RuntimeError(
            f"sketch_composition: no tool call. stop_reason={response.stop_reason}; "
            f"content blocks: {[getattr(b, 'type', '?') for b in response.content]}"
        )

    args = tool_use.input  # type: ignore[union-attr]
    return CompositionSketch(
        focal_point=args["focal_point"],
        shape_inventory=list(args["shape_inventory"]),
        line_weight_plan=args["line_weight_plan"],
        animation_notes=args["animation_notes"],
        rationale=args["rationale"],
    )


STATIC_SYSTEM_PROMPT = """You are a static-SVG author for the Athena lesson-intro video pipeline. You write Remotion primitive components that render a STATIC composition — no animation, no shimmer, no jitter. The next phase will layer in the living treatment; you focus solely on getting the picture right.

# What you write

A standard Remotion primitive component, BUT:
- DO NOT call `useCurrentFrame()` — your component is time-invariant.
- DO NOT import or use `interpolate`, `Easing`, `drawProgress`, or `fadeOpacity` — those are phase 2's job.
- DO NOT add shimmer (per-element opacity oscillation), jitter (sub-pixel translation), or breath (row-level brightness wave).
- DO NOT add fade-ins, fade-outs, or draw progressions — every shape is present at full opacity from frame 0.
- DO use `useVideoConfig()` for `width`, `height` (NOT `fps` — you don't need it).
- DO honor every prop in the schema — they affect what's rendered statically.

# Aesthetic
- Pure white linework, transparent fill, black background provided by composition.
- Use `<filter id="...Glow">` blur+merge primitives for soft glow on lines and tips.
- Line-weight hierarchy: main shapes stroke-width 2-3 / opacity 0.85+, supporting 1 / opacity 0.3-0.5.

# Following the sketch

You receive a composition sketch from the planner. Implement it LITERALLY:
- Each shape in `shape_inventory` becomes an SVG element at the specified canvas coordinates.
- Use the focal point as the visual anchor.
- Apply the line-weight plan as opacity / stroke-width directives.
- IGNORE `animation_notes` — phase 2 reads those.

The sketch IS the spec for this phase. If the sketch is incomplete or ambiguous, fall back to the simplest interpretation that matches the focal_point.

# Output format

Emit via `emit_primitive_component` — the existing tool. Include:
1. `source_tsx` — complete file, static-only, ready to write to disk.
2. `component_name` — PascalCase, matches filename.
3. `props_type_snippet` — same shape as before.
4. `brief_doc` — DESCRIBES THE FINAL PRIMITIVE (post-living-treatment). The brief LLM will read this on subsequent generate calls to know what your primitive does — phrase it as if the animation phase has already been applied. Match the format of existing entries (one sentence + `Props: ...` enumeration of every prop name you implemented). Do NOT mention "static" or "phase 2" in the brief_doc — it's user-facing vocabulary, not pipeline state.

Make it work the first time. The static-render's job is to prove the picture is right; if your output renders a recognizable, on-spec composition, phase 2 can take it from there."""


def author_primitive_static(
    *,
    name: str,
    description: str,
    use_case: str,
    props_schema: dict[str, Any],
    example_props: dict[str, Any],
    sketch: CompositionSketch,
    remotion_root: Path,
    config: Config | None = None,
) -> AuthoredPrimitive:
    """Phase 1 of three-phase authoring: write the static SVG component
    matching the sketch's composition. No animation hooks. Returns an
    AuthoredPrimitive whose source_tsx is static-only."""
    cfg = config or Config.from_env()
    cfg.require_anthropic()
    client = anthropic_client(feature="video-intro-primitive-static")

    references = _load_reference_primitives(remotion_root)

    user_prompt = f"""Author the STATIC composition of a new Remotion primitive. Phase 2 will add animation later — focus exclusively on getting the picture right.

# Spec

snake_case name: `{name}`
description: {description}
use case: {use_case}

props schema (TypeScript-like):
{json.dumps(props_schema, indent=2)}

example props the brief is passing at runtime:
{json.dumps(example_props, indent=2)}

{sketch.to_prompt_section()}

# Reference primitives (for code style — but IGNORE their animation code)

{references}

# Author the static primitive

Emit via `emit_primitive_component`. Implement the sketch literally. No animation. The component should produce a recognizable on-spec composition at every frame — phase 2 will layer in motion next."""

    response = client.messages.create(
        model=cfg.model_author,
        max_tokens=8000,
        system=STATIC_SYSTEM_PROMPT,
        tools=[PRIMITIVE_TOOL],
        tool_choice={"type": "tool", "name": "emit_primitive_component"},
        messages=[{"role": "user", "content": user_prompt}],
    )

    tool_use = next(
        (b for b in response.content if getattr(b, "type", None) == "tool_use"),
        None,
    )
    if tool_use is None:
        raise RuntimeError(
            f"author_primitive_static: no tool call. stop_reason={response.stop_reason}"
        )

    args = tool_use.input  # type: ignore[union-attr]
    component_name = args["component_name"]
    source_tsx = args["source_tsx"]

    if f"export function {component_name}" not in source_tsx and f"export const {component_name}" not in source_tsx:
        raise RuntimeError(
            f"static author: emitted source does not export `{component_name}`. "
            f"Source preview: {source_tsx[:200]!r}"
        )

    return AuthoredPrimitive(
        component_name=component_name,
        props_type_snippet=args["props_type_snippet"],
        source_tsx=source_tsx,
        brief_doc=args["brief_doc"],
    )


LIVING_SYSTEM_PROMPT = """You are the living-treatment author for the Athena lesson-intro video pipeline. You take a static, on-spec Remotion primitive and layer in motion — the three-part living treatment plus reveal animations — without touching the composition.

# What you do

Take the input `static_source` (a .tsx file with no animation) and produce an `output_source` that adds:

1. **Shimmer** — opacity oscillates per-element with a per-element phase offset:
   `0.85 + 0.15 * Math.sin(tSec * 1.8 + idx * 0.31)`
   Apply to main shapes only, not background.

2. **Jitter** — sub-pixel translation per-element with offset:
   `jx = Math.cos(idx * 1.7 + tSec * 1.3) * 0.4`
   `jy = Math.sin(idx * 2.1 + tSec * 1.1) * 0.3`
   Use on translate transforms.

3. **Breath** (where appropriate) — row-or-element-level brightness wave over time:
   `0.55 + 0.22 * Math.sin(tSec * 0.9 - rowIdx * 0.18)`
   For grouped repeating elements like rows / columns / particles.

4. **Reveal animations** — fade-ins, draw progressions for major shapes per the sketch's `animation_notes`. Use:
   - `fadeOpacity({ framesSinceBeatStart: frame, fps, appear_s, disappear_s?, fadeMs })` for opacity fades
   - `drawProgress({ framesSinceBeatStart: frame, fps, startMs, durationMs })` for 0..1 progress over a window (use with cubic-ease-out interpolation)
   - 350-500ms is the established reveal cadence

# What you DON'T do

- Change the composition. Shapes stay at the positions / sizes / focal-point arrangement the static author chose.
- Drop any prop handling. Every prop the static version honors must still be honored.
- Skip the `useCurrentFrame()` / `useVideoConfig()` imports — you're now time-dependent, add them.
- Skip the helper imports (`drawProgress`, `fadeOpacity` from `../utils/timing`).

# Output format

Emit via `emit_primitive_component`. Pass through:
- `component_name` (unchanged from static)
- `props_type_snippet` (unchanged from static)
- `brief_doc` (unchanged from static — already describes the final primitive)
- `source_tsx` — the full updated file with living treatment layered in.

Static visuals are NEVER acceptable as a final primitive. Every main element should subtly shimmer or breathe. Reveal animations should be specific (not "fade in over 500ms" as a single bulk fade — stagger per-element)."""


def author_primitive_living(
    *,
    name: str,
    component_name: str,
    static_source: str,
    sketch: CompositionSketch,
    remotion_root: Path,
    config: Config | None = None,
) -> AuthoredPrimitive:
    """Phase 2 of three-phase authoring: take the static component and
    layer in living treatment + reveal animations. Composition is locked
    by phase 1; this phase only adds motion."""
    cfg = config or Config.from_env()
    cfg.require_anthropic()
    client = anthropic_client(feature="video-intro-primitive-living")

    timing_helpers = _load_timing_helpers(remotion_root)

    user_prompt = f"""Add the living treatment to a static Remotion primitive.

# Phase 1 output (static composition, already approved)

```typescript
{static_source}
```

# Animation notes from the sketch

{sketch.animation_notes}

# Available timing helpers

```typescript
{timing_helpers}
```

# Author the living version

Emit via `emit_primitive_component`. Take the static source above and ADD:
- `useCurrentFrame()` + `useVideoConfig()` imports + calls
- Per-element shimmer + jitter (and breath where elements come in groups)
- Reveal animations per the sketch's animation_notes — use `fadeOpacity` / `drawProgress` from `../utils/timing`

DO NOT change the composition — same shapes, same positions, same focal point. Just add motion."""

    response = client.messages.create(
        model=cfg.model_author,
        max_tokens=8000,
        system=LIVING_SYSTEM_PROMPT,
        tools=[PRIMITIVE_TOOL],
        tool_choice={"type": "tool", "name": "emit_primitive_component"},
        messages=[{"role": "user", "content": user_prompt}],
    )

    tool_use = next(
        (b for b in response.content if getattr(b, "type", None) == "tool_use"),
        None,
    )
    if tool_use is None:
        raise RuntimeError(
            f"author_primitive_living: no tool call. stop_reason={response.stop_reason}"
        )

    args = tool_use.input  # type: ignore[union-attr]
    out_component_name = args["component_name"]
    source_tsx = args["source_tsx"]

    if out_component_name != component_name:
        # Living author isn't supposed to rename the component. If it
        # did, force the original name (and log a warning) rather than
        # breaking the registrations.
        print(
            f"    ⚠ living author returned component_name={out_component_name!r}, "
            f"forcing back to {component_name!r}",
        )
        out_component_name = component_name

    if f"export function {component_name}" not in source_tsx and f"export const {component_name}" not in source_tsx:
        raise RuntimeError(
            f"living author: emitted source does not export `{component_name}`. "
            f"Source preview: {source_tsx[:200]!r}"
        )

    return AuthoredPrimitive(
        component_name=out_component_name,
        props_type_snippet=args["props_type_snippet"],
        source_tsx=source_tsx,
        brief_doc=args["brief_doc"],
    )
