"""
Brief generator — calls Claude with a topic and returns a structured brief
conforming to reference/brief.schema.json.

Uses Anthropic's tool-use for structured output. This is the same pattern as the
existing micro-lesson agent (MICROLESSON_TOOL_USE=1) — Claude emits the brief as
a tool call, we get back parseable JSON instead of prose.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import sys
from pathlib import Path as _Path

# `video_intro/` is sometimes invoked as a script (python -m video_intro …)
# from the agents/ dir; ensure `app.utils.llm_client` is importable in both
# cases. This mirrors the path-insert pattern in scripts/majordomo_create_bucket.py.
sys.path.insert(0, str(_Path(__file__).resolve().parent.parent))
from app.utils.llm_client import anthropic_client  # noqa: E402

from .config import Config  # noqa: E402

# Model for this step comes from Config.model_brief (env var
# VIDEO_INTRO_MODEL_BRIEF, defaults to DEFAULT_MODEL in config.py). The
# brief generator is the highest-leverage step in the pipeline — set
# the env var to an Opus-tier model for production runs.

# Canonical list of registered code-tier primitives. The patcher
# (agents/video_intro/patchers.py) writes into this list between the
# section markers below when a new primitive is registered. The list
# is read by the SYSTEM_PROMPT builder so Claude sees the up-to-date
# vocabulary on every call.
KNOWN_PRIMITIVES: list[str] = [
    "wireframe_mountain",
    "animated_line",
    "rise_run_callout",
    "outro_callouts",
    "coordinate_axes",
    "fraction_compare",
    "callout_grid",
    "scale_bar",
    "coin_flip",
    # ── PRIMITIVE_REGISTRATIONS:start ─────────────────────────
    # AI-authored primitive names. Inserted by
    # agents/video_intro/patchers.py between these markers.
    # Do not edit by hand.
        "basketball_trajectory",
    "parabola_plot",
    "equation_solver",
    "balance_scale",
    "equation_balance",
    "medical_test_visual",
    "rational_function_plot",
    "satellite_dish",
    "satellite_triangulation",
    "basketball_shot",
    "basketball_bounce",
    "linear_hill_story",
# ── PRIMITIVE_REGISTRATIONS:end ───────────────────────────
]

# The tool schema mirrors brief.schema.json — Claude fills it in.
# Kept lean (no $ref / nested $schema) because Anthropic's tool schema is JSON-Schema-7-ish
# but doesn't support all draft-07 features. Validation against the strict schema
# happens after Claude returns its tool call.
BRIEF_TOOL: dict[str, Any] = {
    "name": "emit_video_intro_brief",
    "description": (
        "Emit a structured brief for a 15–45s intro/motivator video. The video "
        "introduces a math concept using a real-world analog, white linework on "
        "black aesthetic. Beats are time-aligned to a narration script. Captions "
        "and math overlays are rendered by code (NEVER by the video model)."
    ),
    "input_schema": {
        "type": "object",
        "required": ["topic", "concept", "style", "narration", "beats"],
        "properties": {
            "topic": {"type": "string"},
            "concept": {
                "type": "object",
                "required": ["math_concept", "real_world_analog", "style_strategy"],
                "properties": {
                    "math_concept": {"type": "string"},
                    "real_world_analog": {
                        "type": "string",
                        "description": (
                            "Role-dependent — read the system prompt's "
                            "tone section before filling this in. "
                            "For INTROS: a SPECIFIC real-world USE of "
                            "this math (e.g. 'GPS triangulation', "
                            "'thermostat PID control', 'package routing "
                            "in last-mile delivery') — NOT an abstract "
                            "teaching metaphor. "
                            "For WRAP-UPS: a sustained physical "
                            "analogy whose mechanics ARE the math "
                            "(e.g. 'basketball rolling down a hill "
                            "shaped like y = mx + b', 'skateboard ramp "
                            "as a parabola'). Intros hook with stakes; "
                            "wrap-ups lock in memory via embodied story."
                        ),
                    },
                    "style_strategy": {
                        "type": "string",
                        "enum": ["applied", "metaphorical", "literal"],
                        "description": (
                            "Role-dependent default — see system "
                            "prompt's # Visual strategy section. "
                            "INTROS default to `applied`; "
                            "`metaphorical` is reserved for culturally-"
                            "vivid analogs only (no balance-scale / "
                            "treasure-map / 'imagine a...' framings). "
                            "WRAP-UPS default to `metaphorical` — the "
                            "wrap-up's whole job is the sustained "
                            "analogy."
                        ),
                    },
                },
            },
            "style": {
                "type": "object",
                "required": ["background_motif", "anchor_objects"],
                "properties": {
                    "background_motif": {
                        "type": "string",
                        "enum": [
                            "wireframe_terrain",
                            "starfield",
                            "sparse_arcs",
                            "blank",
                        ],
                    },
                    "anchor_objects": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["id", "description"],
                            "properties": {
                                "id": {"type": "string"},
                                "description": {"type": "string"},
                            },
                        },
                    },
                },
            },
            "narration": {
                "type": "object",
                "required": ["script"],
                "properties": {
                    "script": {
                        "type": "string",
                        "description": "Plain prose narration, 30-90 words for a 15-45s video.",
                    },
                },
            },
            "beats": {
                "type": "array",
                "minItems": 4,
                "maxItems": 8,
                "items": {
                    "type": "object",
                    "required": [
                        "id",
                        "start_s",
                        "end_s",
                        "narration_span",
                        "visual",
                    ],
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "Stable beat ID, e.g. 'b1_establish'.",
                        },
                        "start_s": {"type": "number"},
                        "end_s": {"type": "number"},
                        "narration_span": {
                            "type": "string",
                            "description": "Slice of narration covered by this beat (empty string OK for pure visual development).",
                        },
                        "visual": {
                            "type": "object",
                            "required": ["primary", "renderer_hint"],
                            "properties": {
                                "primary": {"type": "string"},
                                "renderer_hint": {
                                    "type": "object",
                                    "properties": {
                                        "code": {
                                            "type": "object",
                                            "required": ["primitive", "props"],
                                            "properties": {
                                                "primitive": {
                                                    "type": "string",
                                                    "description": (
                                                        "snake_case primitive name. Either an EXISTING "
                                                        "primitive (and you omit `_new`), or a NEW name "
                                                        "(and you set `_new` with the spec — the "
                                                        "orchestrator will author it before render). "
                                                        "See the system prompt for the canonical "
                                                        "vocabulary."
                                                    ),
                                                },
                                                "props": {"type": "object"},
                                                "anchor_id": {"type": "string"},
                                                "_new": {
                                                    "type": "object",
                                                    "description": (
                                                        "Set this when `primitive` is a NEW name not in the "
                                                        "existing vocabulary. The orchestrator authors the "
                                                        "primitive before render. OMIT this field when "
                                                        "referencing an existing primitive."
                                                    ),
                                                    "required": [
                                                        "description",
                                                        "use_case",
                                                        "props_schema",
                                                    ],
                                                    "properties": {
                                                        "description": {
                                                            "type": "string",
                                                            "description": (
                                                                "1-2 sentences explaining what the primitive "
                                                                "visually does."
                                                            ),
                                                        },
                                                        "use_case": {
                                                            "type": "string",
                                                            "description": (
                                                                "Which kinds of math beats this primitive fits "
                                                                "(e.g. 'parabola plotting for quadratic "
                                                                "lessons; can also show a vertex marker')."
                                                            ),
                                                        },
                                                        "props_schema": {
                                                            "type": "object",
                                                            "description": (
                                                                "Object describing the props shape. Keys are "
                                                                "prop names; values are TypeScript-style type "
                                                                "descriptions (string). Example: "
                                                                "{'a': 'number', 'b': 'number', 'c': 'number', "
                                                                "'show_vertex': 'boolean'}."
                                                            ),
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        "overlays": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "required": ["kind", "content"],
                                "properties": {
                                    "kind": {
                                        "type": "string",
                                        "enum": [
                                            "caption",
                                            "math",
                                            "label",
                                            "callout",
                                        ],
                                    },
                                    "content": {"type": "string"},
                                    "position": {
                                        "type": "string",
                                        "enum": [
                                            "bottom_center",
                                            "top_center",
                                            "top_left",
                                            "top_right",
                                            "center",
                                            "anchor",
                                        ],
                                    },
                                    "appear_s": {"type": "number"},
                                    "disappear_s": {"type": "number"},
                                },
                            },
                        },
                    },
                },
            },
        },
    },
}

# Hand-authored docs for the 9 starter primitives, keyed by snake_case
# name. Loaded into the SYSTEM_PROMPT at build time. New entries written
# by patcher.patch_brief_enum end up in KNOWN_PRIMITIVES; they don't get
# rich docs (Claude knows about them by name but won't have detailed
# usage hints — acceptable for an autonomous loop).
_BUILTIN_PRIMITIVE_DOCS: dict[str, str] = {
    "wireframe_mountain": "atmospheric establishing scene, useful for 'intro' beats. Props: peak_height, peak_sharpness, secondary_peak_height, camera ('slow_push_in' | 'continued_push_in' | 'orbit_right'), show_both, particle_flow_up.",
    "animated_line": "coordinate plot with one or more lines drawing in along their slope. Props: lines:[{label, slope, intercept?, color?, draw_in_ms?}], axes_fade_in_ms, overlay_on (default 'blank'; set to 'wireframe_terrain' ONLY for explicitly atmospheric/establishing beats).",
    "rise_run_callout": "right-triangle slope visualization with rise/run legs. Props: line_slope, show_rise_run_triangle, rise_label, run_label, formula_latex.",
    "outro_callouts": "closing 4-corner takeaway grid with particle-wave background. Props: background, callouts_top_left, callouts_top_right, callouts_bottom_left, callouts_bottom_right (each 'TITLE — body').",
    "coordinate_axes": "standalone Cartesian axes (no line). Useful when a later beat will plot points/lines on top, or when you want to introduce the coordinate plane itself. Props: x_range:[min,max], y_range:[min,max], tick_interval, show_grid, show_origin_label, axis_label_x, axis_label_y, highlight_quadrant (1–4).",
    "fraction_compare": "two fractions side-by-side with an auto-derived <, >, or = operator. Use for ratio / proportion / fraction-comparison beats. Props: left:{num, denom, label?}, right:{num, denom, label?}, operator? ('<' | '>' | '=' | 'auto'), style? ('bar' | 'pie' | 'both').",
    "callout_grid": "generalization of outro_callouts for non-outro contexts. Use for agendas, key takeaways, side-by-side definitions. Props: layout ('2x2' | '1x4' | '1x3'), cells:[{heading?, body, accent?:'primary'|'default'}], background, stagger_ms.",
    "scale_bar": "horizontal bar-chart magnitude comparison. Use for 'X is N times Y' / ratio / proportion / data-display beats. Props: bars:[{value, label, color?}], unit?, show_ratio? (when true, displays simplified ratio at the bottom), overlay_on (default 'blank' — keep the chart on clean black; only set to 'wireframe_terrain' if the beat is explicitly atmospheric).",
    "coin_flip": "animated sequence of coin flips with tally + optional probability label. Use for probability / sample-space beats. Props: outcomes:['H'|'T', ...], show_probability, flip_duration_ms, landing_dwell_ms.",
    # Backfilled manually for an AI-authored primitive that was created
    # before the primitive author started capturing brief_doc. Without
    # this entry the brief LLM hallucinates prop names like
    # `initial_equation` and `steps: {equation, operation}[]`; the
    # primitive's runtime is schema-tolerant for both shapes but the
    # doc here pins the canonical form.
    "equation_solver": "**BANNED FOR INTRO BRIEFS** — see the 'NEVER perform the math in the intro' section. Animates a step-by-step algebraic solve, which is exactly what the lesson AFTER the video teaches. Using this in an intro just rehearses the lesson. If you'd reach for this, use a static `math` overlay alongside an applied primitive instead.",
    # ── PRIMITIVE_DOCS:start ─────────────────────────
    # AI-authored primitive docs. Inserted by
    # agents/video_intro/patchers.py between these markers when a new
    # primitive is authored. Each entry is the same sentence-plus-props
    # shape as the hand-written entries above. Do not edit by hand —
    # the doc is captured from the author's tool-use output so the
    # brief generator sees the primitive's ACTUAL props on subsequent
    # runs (otherwise the brief LLM hallucinates plausible-but-wrong
    # prop shapes).
    "balance_scale": "wireframe balance scale with weights on each side showing equilibrium concept. Use for equation solving / balance visualization beats. Props: left_weight (weight on left side), right_weight (weight on right side), show_equilibrium (whether scale is balanced), animation ('gentle_sway' | 'tilt_left' | 'tilt_right' | 'static').",
    "equation_balance": "**BANNED FOR INTRO BRIEFS** — see the 'NEVER perform the math in the intro' section. Visualizes 'both sides' equation-solving via a balance-scale metaphor — pedagogical content the lesson teaches. Pre-banned in this intro pipeline because it conflates 'intro hook' with 'lesson aid'.",
    "medical_test_visual": "medical test result visualization with positive/negative indicator and optional uncertainty bars. Use for conditional probability / diagnostic testing / false positive beats. Props: test_result ('positive'|'negative'), show_uncertainty (displays confidence interval bars below), animation ('test_reveal'|'static'|'pulse').",
    "rational_function_plot": "rational function plot showing P(x)/Q(x) with characteristic asymptotic behavior and smooth curves. Use for rational function lessons demonstrating discontinuities, asymptotes, and polynomial ratios. Props: numerator_degree (degree of P(x)), denominator_degree (degree of Q(x)), show_asymptotes? (draws vertical asymptote lines), show_peak_marker? (highlights local maxima), highlight_undefined_regions? (shades discontinuous zones), animation? (curve drawing behavior).",
    "satellite_dish": "Wireframe parabolic satellite dish cross-section with converging signal rays, illustrating real-world parabolic geometry for quadratic equation intros. The dish curve draws in, parallel rays animate downward and reflect to the focal point, and the focus marker pulses in with a cyan glow. Props: dish_width (width of dish opening, default 10), focal_length (vertex-to-focus distance, default 2.5), num_rays (number of parallel signal rays, default 5), draw_in_ms (time in ms to draw the dish curve, default 1200), ray_animate_ms (time in ms for rays to converge to focus, default 1500), show_focus_marker (highlight the focal point with a glowing cyan dot and label, default true).",
    "satellite_triangulation": "GPS triangulation diagram with wireframe satellite diamonds arranged in a concave arc across the upper frame, dashed signal lines converging to a glowing cyan receiver dot at bottom-center. Signal lines animate a traveling glow from each satellite to the receiver in a continuous loop. Use for GPS / triangulation / systems-of-equations intros emphasising distance-based calculations. Props: num_satellites (2\u20134, controls how many satellite icons appear in the arc), show_distance_lines (whether dashed convergence lines are drawn from satellites to receiver), animation ('pulse_signals' | 'static' \u2014 whether signal lines show a traveling glow pulse).",
    "basketball_shot": "Wireframe basketball shot arc from a release point to a basketball hoop rim, with a dashed parabolic trail, mid-flight ball with seam lines, cyan rim circle, net hatching, backboard, optional court floor, and an equation label near the apex. Use for quadratic equation / projectile motion / parabola intro beats where a recognisable real-world shot anchors the math. Props: release_position ([number, number] \u2014 pixel coords of shooter's release point, default [200,600]), rim_position ([number, number] \u2014 pixel coords of rim center, default [1000,350]), peak_height_pixels (number \u2014 how far above the rim the arc apex sits, default 200), show_trail (boolean \u2014 draw dashed parabolic trail, default true), show_court_floor (boolean \u2014 draw faint dashed floor line at release y, default true), ball_radius (number \u2014 basketball radius in pixels, default 18).",
    "basketball_bounce": "Wireframe basketball bouncing on a horizontal floor line with geometrically decaying peak heights (h\u2080, h\u2080\u00b7r, h\u2080\u00b7r\u00b2, \u2026), forming the canonical coefficient-of-restitution / geometric-sequence envelope diagram. The ball is shown at the first peak with crossing seam arcs; dashed parabolic arcs connect all floor contact points; optional vertical tick lines and monospace height labels at each peak make the geometric sequence explicit. Use for geometric sequences, exponential decay, or coefficient-of-restitution intro beats. Props: initial_height_pixels (drop height above floor in pixels, default 380), restitution (fraction of height retained per bounce, default 0.7), num_bounces (number of bounce arcs, default 5), show_trail (draw dashed parabolic trail path, default true), show_heights (label each peak with h\u2099 = value, default true), ball_radius (basketball radius in pixels, default 18), horizontal_speed_pixels_per_s (horizontal travel speed used by phase 2 animation, default 80).",
    "linear_hill_story": "Single sustained 'basketball on a hill' analogy for slope-intercept form y = mx + b. Renders coordinate axes + the line y = mx + b once, with a bathroom-sign pictogram figure standing on the line + a wireframe basketball positioned beside / rolling along / caught at the x-intercept depending on `phase`. The line IS the hill. **Wrap-up videos only** — performs the math as named features of the analogy. Props: slope (m in y=mx+b, default -2), y_intercept (b, default 3), x_range ([number, number], default [-0.5, 3.5]), y_range ([number, number], default [-0.5, 5]), phase (one of: 'character_idle' = figure + ball at the y-intercept, 'rolling' = ball animates from y-intercept down to x-intercept, 'slope_arrows' = right-1-down-|m| triangle marker on the line midpoint, 'y_intercept_glow' = pulsing dot + (0, b) label at the y-axis crossing, 'x_intercept_catch' = ball at x-intercept; figure moved to bottom of the hill, 'celebration' = figure at frame-center with arms up holding ball aloft; line + axes recede), show_axes (default true), show_equation_label (top-right 'y = -2x + 3' label, default true).",
# ── PRIMITIVE_DOCS:end ───────────────────────────
}


def _build_primitive_doc() -> str:
    """Render the primitive vocabulary section, dynamically built from
    KNOWN_PRIMITIVES so AI-authored primitives auto-appear in subsequent
    brief generation calls."""
    lines: list[str] = []
    for name in KNOWN_PRIMITIVES:
        doc = _BUILTIN_PRIMITIVE_DOCS.get(name)
        if doc is None:
            lines.append(
                f"- `{name}` — AI-authored primitive (see "
                f"video-intro-remotion/src/primitives/ for the component + props shape)."
            )
        else:
            lines.append(f"- `{name}` — {doc}")
    return "\n".join(lines)


def _opening_paragraph(role: str) -> str:
    if role == "wrap-up":
        return (
            "You are a video brief author for Athena. You design 30–45 "
            "second WRAP-UP videos that lock a freshly-taught math "
            "concept into memory by retelling it through ONE sustained, "
            "vivid, concrete analogy a student can picture and walk "
            "through end-to-end. The micro-lesson BEFORE the video "
            "already taught the procedure; your job is to make it "
            "STICK by anchoring the math to an embodied story."
        )
    return (
        "You are a video brief author for Athena. You design 15–45 "
        "second intro videos that hook a student into a math topic by "
        "showing them WHERE THE MATH ACTUALLY LIVES in the real world "
        "— what it powers, what it decides, what breaks without it. "
        "The micro-lesson after the video teaches the procedure; your "
        "job is to make the student CARE before the lesson begins."
    )


def _tone_section(role: str) -> str:
    if role == "wrap-up":
        return """# Tone — embodied story, not test prep
The video plays AFTER the lesson. The student has just learned the procedure; your job is to lock it into memory via ONE sustained analogy that walks the math through a concrete, picturable scene end-to-end.

**Do** carry the entire video on a single physical analogy whose mechanics ARE the math.
  ✓ "You're playing basketball at the top of a hill shaped like y = -2x + 3. The ball starts rolling down the slope..."
  ✓ "A skateboard ramp's profile is the parabola y = x². The vertex is the bottom of the ramp..."
  ✓ "A staircase where each step adds the same height — that's an arithmetic sequence. Step 1 sits at +3, every step adds 2..."
  ✗ "Linear equations show up in GPS, routing, thermostats..." — that's an INTRO (real-world hook), not a wrap-up (analogy lock-in).
  ✗ "Step 1: identify the slope. Step 2..." — that's the lesson; you don't restate the procedure literally.

**Do** name and surface the math AS the analogy unfolds. The slope is the steepness of the hill. The y-intercept is where the player is standing. The x-intercept is where the ball lands. Naming the formal terms is encouraged here — this is consolidation, not introduction.

**Do** end on a takeaway that ties the analogy back to the generalized form.
  ✓ "And now you can read any linear equation: the coefficient on x is the hill's slope, the constant is where you start."
  ✓ "Any quadratic y = ax² + bx + c is just a ramp — `a` controls how steep, the vertex is the bottom, the roots are where it meets the floor."
  ✗ "Now you've mastered linear equations!" — sentiment-only, doesn't add structural insight.

Avoid: multi-analogy montage (the wrap-up is ONE story, not a list), abstract "imagine a..." openers with no concrete scene, and any beat that breaks the spatial continuity of the analogy. If the camera "leaves" the hill for a different setting, you've reverted to intro mode."""
    return """# Tone — applied, not didactic
The video plays BEFORE the lesson. It must NOT rehearse the lesson. It must HOOK with real-world stakes.

**Do** open by showing the math in the wild — a tangible use that decides an outcome a viewer can picture and care about.
  ✓ "Every GPS fix on your phone solves a linear equation across satellite distances."
  ✓ "The thermostat in this room solves one of these every second to decide whether to fire the boiler."
  ✓ "Couriers route 18 million packages a day by solving thousands of these at once."
  ✗ "Imagine a balance scale where each side weighs the same." — this is the lesson talking, not the world.
  ✗ "Linear equations are the foundation of algebra." — abstract and self-referential.

**Do** make the math appear as a tool serving the application, not as the subject. When the equation comes on screen, it should feel like the engineer/courier/satellite/whatever is using it RIGHT NOW.
  ✓ "Here's the equation a self-driving car solves to stay centered in its lane: 3x + 7 = 22."
  ✗ "We isolate the variable by performing the same operation on both sides." — that's the lesson.

**Do** close on impact or a second application — what becomes possible because this math works.
  ✓ "Solve millions of these per second, and you get realtime GPS, package routing, and the closed-loop control behind every modern car."
  ✗ "ONE SOLUTION — Linear equations always have exactly one answer." — that's a takeaway slide.

Avoid these patterns entirely: lesson-recap takeaway grids ("STEP-BY-STEP / CHECK YOUR WORK"), procedure callouts ("ADD / SUBTRACT / MULTIPLY / DIVIDE"), and "imagine a scale / imagine a journey" abstract metaphors. If your callouts could appear on the closing slide of a worksheet, they're wrong here.

The micro-lesson WILL teach the procedure. You don't need to. Your video should leave the student thinking "wait — *that's* what this math actually does?" — then the lesson starts."""


def _math_performance_section(role: str) -> str:
    if role == "wrap-up":
        return """# Performing the math — encouraged in wrap-ups, as features of the analogy
Unlike intros, wrap-ups MAY (and should) name and surface the key mathematical values as the analogy unfolds. Show the slope on the hill. Glow the y-intercept where the player stands. Mark the x-intercept where the ball lands. The student just learned what these are — the wrap-up's job is to map each concept to a memorable visual position in the scene.

What's still NOT allowed: animating a step-by-step algebraic solve. The wrap-up is not a re-run of the lesson's procedure. If your video shows row after row of "subtract 3 from both sides, divide by 2," you've rebuilt the lesson. Keep the math as NAMED VALUES surfaced in the analogy (slope = -2; y-intercept = (0, 3); x-intercept where y = 0) — not as a chain of operations.

**Banned even in wrap-ups**:
- `equation_solver` — animated step-by-step solves. Use a static `math` overlay with the form (e.g. y = mx + b) plus the analogy's labeled values instead.
- `equation_balance` — solving-via-balance metaphor.
- Any AI-authored primitive whose props include `steps`, `step_sequence`, `derivation_steps`, or similar — those describe a solve."""
    return """# NEVER perform the math in the intro
The lesson that follows the video teaches the procedure (e.g. how to solve a linear equation, how to apply Bayes' rule). Your intro must NOT also do that — it would just be a worse version of the lesson.

**Banned patterns** (these are lesson content, not intro content):
- Animated step-by-step solving (15x = 1200 → x = 1200 ÷ 15 → x = 80)
- "Solve for x" reveal animations that land on a final answer
- Multi-row derivations showing operations applied to both sides
- Step-counter callouts ("Step 1: subtract 3 from both sides")

**DO NOT USE** these primitives for intro videos — they exist for the lesson, not for you:
- `equation_solver` — animates step-by-step solves. Banned.
- `equation_balance` — solving-via-balance metaphor. Banned.
- Any AI-authored primitive whose props include `steps`, `step_sequence`, `derivation_steps`, or similar — those describe a solve. Don't request such primitives.

An equation MAY appear on screen statically as part of the application context — e.g. "Here's the form a GPS receiver fits to satellite ranges: 3x + 7 = 22" with the equation rendered as a static `math` overlay and the screen otherwise showing the receiver / satellites. What's banned is *animating the algebra*. If you find yourself listing 2+ rows of math, you're teaching, not hooking."""


def _breadth_or_depth_section(role: str) -> str:
    if role == "wrap-up":
        return """# Depth on ONE analogy, not breadth
The wrap-up is the INVERSE of the intro. The intro shows BREADTH (this math is everywhere); the wrap-up goes DEEP on ONE concrete analogy. Pick a single physical scene and stay there for the entire video — same hill, same character, same coordinate plane, only the overlay phase changes between beats.

**Anti-pattern**: swapping analogies mid-video (basketball-on-a-hill in beats 1–3, then a thermometer in beats 4–6). That defeats the lock-in purpose; the student remembers two half-stories instead of one whole one.

**The single-analogy structure that works**:
1. **Setup** (1–2 beats): introduce the scene and tie its shape to the math.
2. **Reveal** (3–4 beats): one beat per key concept; surface each concept as a feature of the scene.
3. **Recap** (1 beat): the scene resolves; the takeaway names the math in its general form."""
    return """# Show breadth, not depth
The topic of the video is the SUBTOPIC (e.g. "Linear equations in one variable", "Conditional probability"), not a single application instance. Your video must suggest the BREADTH of where this math lives — the student should leave thinking "this shows up everywhere," not "today I learned about COVID test accuracy."

**Two valid structures** for conveying breadth:

  (a) **Montage**: 2–3 different applications across consecutive beats. Each gets ~3–5s of screen time. The cumulative impression is variety.
    ✓ "GPS receivers solve them across satellite ranges. Thermostats solve them every second. Pharmacists solve them to dose patients by weight. Anywhere two quantities scale linearly, this same form decides the outcome."

  (b) **Representative single example, explicitly framed**: ONE concrete use, framed as one-of-many.
    ✓ "Of the thousands of places this equation form appears — from radar to currency markets to your phone's GPS — let's pick one. When a pharmacist doses a patient by body weight..."
    ✗ "Every time a doctor prescribes medication, they solve a linear equation." — implies this is THE use, not one of many.

**Anti-pattern**: spending the whole video drilled into one specific instance (e.g. all 20 seconds on rapid COVID tests for conditional probability). That over-narrows the subtopic and conflates one application with the math itself. The lesson can explore one example in depth — your intro can't."""


def _visual_strategy_section(role: str) -> str:
    if role == "wrap-up":
        return """# Visual strategy
- `style_strategy: "metaphorical"` — a real-world analog where the math IS the mechanics of the scene (hill = line, ramp = parabola, staircase = arithmetic sequence). **This is the default for wrap-ups.** The "imagine a balance scale" ban that applies to intros does NOT apply here — for wrap-ups, the embodied analogy IS the point. What matters is that the analogy is concrete, picturable, and held the entire video.
- `style_strategy: "literal"` — visuals ARE the math (just the graph, just the equation). Use for wrap-ups of topics where the formal object itself is the lesson (e.g. wrap-up of "what is a parabola" might just animate one).
- `style_strategy: "applied"` — real-world use case. Generally NOT the right fit for a wrap-up — that's intro territory."""
    return """# Visual strategy
- `style_strategy: "applied"` — frame the math through a concrete real-world use (GPS, routing, control systems, finance, biology, sports analytics, etc.). Math notation appears as a tool in someone's hands, not as the subject. **This is the default.**
- `style_strategy: "metaphorical"` — a real-world analog where the math is implicit (e.g. mountain trails = slope, balance scale = equation). Use sparingly — only when the analog is itself culturally vivid (and even then, avoid balance-scale / treasure-map / "imagine a..." openers, which read as teacher-talk).
- `style_strategy: "literal"` — visuals ARE the math (graphs, equations being drawn). Use only for topics where the formal object itself is what matters (e.g. a parabola animation for "what is a parabola"). Avoid for procedural topics like "solving equations.\""""


def _exemplar_section(role: str) -> str:
    if role != "wrap-up":
        return ""
    return """# Exemplar — basketball-on-a-hill wrap-up for linear equations (two variables)

A model wrap-up that captures the pattern (~40s total, single sustained analogy, ONE primitive driving every beat):

  b1 (0–8s):   "You're playing basketball at the top of a hill shaped like y = -2x + 3."
               → Wireframe character + ball stand on the line y = -2x + 3; coordinate axes + equation label visible.
  b2 (8–12s):  "The ball starts rolling down the slope."
               → Same scene; the ball animates along the line from the y-intercept toward the bottom-right.
  b3 (12–19s): "That -2 is the slope — for every 1 step right, the line drops 2."
               → Same scene; right-1-down-2 arrows appear on the midline as a rise/run marker.
  b4 (19–26s): "The +3 is the y-intercept — where the line meets the y-axis at (0, 3)."
               → Same scene; a glowing pulse + "(0, 3)" label at the y-intercept point.
  b5 (26–33s): "The ball rolls all the way down to the x-intercept, where y = 0."
               → Same scene; ball lands at (1.5, 0), character catches it at the bottom of the hill.
  b6 (33–42s): "And now you can read any linear equation."
               → Same scene fades back; character holds ball aloft; y = mx + b appears as a final overlay.

Notice the structure: ONE physical scene (a hill that IS the line y = mx + b) is reused across every beat — only the overlay phase changes. Each named concept (slope, y-intercept, x-intercept) gets exactly one beat where it surfaces as a visible feature of the scene. The closing beat names the generalized form (y = mx + b) and ties the analogy back. There is no second analogy, no procedural solve, no test-prep framing.

To author a comparable wrap-up for a different subtopic: pick one physical analogy whose mechanics map to the topic's named values, then build ONE primitive (with a `phase` enum) that draws the scene and toggles which named value is highlighted on each beat."""


def build_system_prompt(role: str = "intro") -> str:
    """Compose the system prompt with the current KNOWN_PRIMITIVES list
    spliced in, flavored for the requested video role.

    role:
      - "intro" (default): hook-before-lesson video. Tone is applied,
        real-world stakes, no math performance, breadth over depth.
      - "wrap-up": lock-in-after-lesson video. Tone is one sustained
        embodied analogy that walks the math through a concrete scene.
        Math performance (naming slope/intercepts/etc.) is encouraged
        as features of the analogy. Depth over breadth.

    Called per request so AI-authored primitives appear as available
    options in the very next brief generation."""
    if role not in ("intro", "wrap-up"):
        raise ValueError(f"role must be 'intro' or 'wrap-up', got {role!r}")
    return f"""{_opening_paragraph(role)}

# Aesthetic (locked)
- Pure white linework on pure black background.
- Technical illustration / particle-mesh feel.
- Every visual is rendered by a deterministic Remotion primitive — there is no external video model, no photoreal generation.

# Structure
- 4–8 beats. Each beat covers a contiguous slice of the narration.
- Beats can be silent visual development (narration_span = "") between speaking beats.
- start_s must be 0.0; beats must be contiguous (end_s of beat N == start_s of beat N+1); the last beat's end_s = total duration.
- **Every beat needs at least 2.0s of airtime.** Zero-duration or sub-second beats crash the renderer.
- **Outro beats** (`callout_grid` or `outro_callouts`) need at least **4.0s** of airtime — they stagger cells in (typically 300–500ms apart) and need time for all cells to land AND dwell for the viewer. A 2x2 grid with 4 cells × 300ms stagger = 1.2s to appear; pad another 2s+ dwell.
- If you plan an outro AFTER narration ends, the total video duration must extend past the narration to give that beat its airtime. E.g. for 18s of narration + a 5s outro callout, total duration is 23s and the outro beat occupies 18s→23s with `narration_span = ""`.

# Primitives — the only renderer

The primitives below are deterministic React components rendered by Remotion. Pick one per beat by snake_case name on `code.primitive`.

{_build_primitive_doc()}

# Requesting a NEW primitive (this is encouraged — autonomous loop)

If NONE of the existing primitives fit a beat well, you can REQUEST a new one. Set `code.primitive` to a NEW snake_case name (one that's not in the list above) AND set `code._new` with a spec the orchestrator will use to author the component:

```
"code": {{
  "primitive": "parabola_plot",
  "props": {{ "a": 1, "b": 0, "c": -3, "x_range": [-3, 3], "show_vertex": true }},
  "_new": {{
    "description": "Plots y = ax^2 + bx + c on a coordinate plane with an optional vertex marker. The parabola draws from left to right as a glowing curve.",
    "use_case": "Quadratic function lessons — show the parabola, mark the vertex, optionally label x-intercepts.",
    "props_schema": {{
      "a": "number — leading coefficient (required)",
      "b": "number — linear coefficient (required)",
      "c": "number — constant (required)",
      "x_range": "[number, number] — plot domain, default [-5, 5]",
      "show_vertex": "boolean — draw a marker + label at the vertex",
      "color": "string — stroke color, default white"
    }}
  }}
}}
```

The orchestrator authors the .tsx, registers it, sanity-renders it (typecheck + 5-frame render), and if everything passes the final brief renders with the new primitive. If authoring fails after 3 retries, the beat falls back to caption-on-black.

Prefer requesting a new primitive over omitting `code` entirely. A black beat under live narration looks broken; a code-authored primitive — even a simple one — reads as intentional. Don't request new primitives for beats where an existing one fits well; only when the existing vocabulary genuinely can't represent what the beat shows.

# Overlays
- Use `caption` for spoken narration that should appear as subtitle (1 per speaking beat).
- Use `math` for LaTeX expressions (rendered via KaTeX). E.g. content="y = 1.75x".
- Use `callout` for the outro 4-corner panels ("TITLE — body description").
- `appear_s` is relative to beat start. Captions usually appear_s: 0.2.

# When NOT to use a `math` overlay
**Strict rule: a beat must NEVER have both a `math` overlay AND a primitive that draws equations.** Equation-drawing primitives include `equation_solver`, `equation_balance`, and any AI-authored primitive whose props include `equation`, `expression`, `steps`, `left_expression`, `right_expression`, or similar math-text fields. This rule holds regardless of whether the primitive is "introducing" or "solving" the equation — the primitive's own typography is the authoritative rendering, and a KaTeX overlay on top produces a visible second rendering in a different font that competes for attention.

Use `math` overlays ONLY for beats whose primitive is metaphorical (a real-world analog like `wireframe_mountain`, `coin_flip`, or `scale_bar`) and you want the corresponding equation to appear alongside the visual.

# Topic dimensionality
Match the visual's dimensionality to the topic's variable count:
- **1-variable topics** (linear equations in one variable, percentages, ratios, arithmetic) → use 1D visuals: number lines, scale bars, equation rows. **Do NOT use `coordinate_axes`** — a 2D Cartesian plane implies graphing a function of two variables and teaches the wrong mental model.
- **2-variable topics** (linear functions y = mx + b, slope, systems of equations, parabolas) → 2D coordinate visuals (`animated_line`, `coordinate_axes`, `parabola_plot`) are correct.

When in doubt, ask: "is there a y-axis in the math being taught?" If no, don't put one in the visual.

# Callout / takeaway content
For `callout_grid` cells and `outro_callouts`, every cell must teach the **concept**, not promote the platform, test, or lesson context. Each cell should state a concrete mathematical or procedural fact a student could use.

Avoid:
- Test-prep marketing — "SAT READY", "Master this foundation", "Test success", "Boost your score".
- Platform / journey filler — "Practice more", "Continue your learning".
- Sentiment-only cells with no math content.

Be mathematically precise. If a general claim has edge cases (e.g. "linear equations always have exactly one solution" is false for `0 = 0` or `0 = 1`), qualify the claim or pick a different one. Better to write three solid cells than four with one weak.

# Length & pacing
- 15-45s total. Aim for 25-35s by default.
- Each beat 3-10s. Don't make beats shorter than 2s unless visual is very fast.
- Narration: roughly 2.5 words per second when speaking. 30s of speaking ≈ 75 words.

{_tone_section(role)}

{_math_performance_section(role)}

{_breadth_or_depth_section(role)}

{_visual_strategy_section(role)}
{_exemplar_section(role)}

# Anchor objects
`style.anchor_objects` is a brief-level field for narrative continuity. For INTROS, most briefs leave this empty. For WRAP-UPS, this is where you declare the single sustained scene (e.g. `id="hill_line"`, `description="The line y = -2x + 3 doubling as a hill across all beats"`) so downstream primitives know what's persisting.

Emit the brief via the `emit_video_intro_brief` tool. Be specific. Don't hedge."""


# Backward-compat alias for any imports of SYSTEM_PROMPT. Evaluated
# once at import time; later patches to KNOWN_PRIMITIVES won't affect
# this string. Use build_system_prompt(role=...) inside generate_brief
# instead. Defaults to the intro flavor for back-compat.
SYSTEM_PROMPT = build_system_prompt()


USER_PROMPT_TEMPLATE = """Generate a video intro brief for:

Topic: {topic_name}
Subtopic: {subtopic_name}
Subject: SAT Math

Lesson context: {lesson_context}

Target duration: {target_duration_s} seconds
Style strategy: {style_strategy_hint}

Author the brief now."""


@dataclass
class GeneratedBrief:
    brief: dict[str, Any]
    raw_response: Any  # the anthropic message object, for logging


def generate_brief(
    topic_slug: str,
    subtopic_slug: str,
    topic_name: str,
    subtopic_name: str,
    lesson_context: str = "",
    target_duration_s: float = 30.0,
    style_strategy_hint: str | None = None,
    role: str = "intro",
    config: Config | None = None,
) -> GeneratedBrief:
    """Call Claude to produce a brief for the given lesson.

    role: "intro" (default) hooks BEFORE the lesson with real-world
    stakes; "wrap-up" plays AFTER the lesson with one sustained embodied
    analogy. The system prompt swaps tone-rules accordingly.

    style_strategy_hint: if None, auto-picks "applied" for intros and
    "metaphorical" for wrap-ups. Pass an explicit value to override."""
    if role not in ("intro", "wrap-up"):
        raise ValueError(f"role must be 'intro' or 'wrap-up', got {role!r}")
    if style_strategy_hint is None:
        style_strategy_hint = "metaphorical" if role == "wrap-up" else "applied"
    cfg = config or Config.from_env()
    # When MAJORDOMO_ENABLED=1, the gateway handles Anthropic auth via the
    # Steward's configured key — the client-side ANTHROPIC_API_KEY is not
    # used. When MAJORDOMO_ENABLED=0, the helper returns a vanilla client
    # that picks up ANTHROPIC_API_KEY from the environment automatically.
    # Either way, cfg.require_anthropic() at module load is still useful
    # for the bypass case (it asserts the key is set), so we keep the
    # config object around even though we don't thread its api_key through.
    cfg.require_anthropic()
    client = anthropic_client(feature="video-intro-brief")

    user_prompt = USER_PROMPT_TEMPLATE.format(
        topic_name=topic_name,
        subtopic_name=subtopic_name,
        lesson_context=lesson_context or "(no extra context — use your best understanding of this SAT topic)",
        target_duration_s=int(target_duration_s),
        style_strategy_hint=style_strategy_hint,
    )

    response = client.messages.create(
        model=cfg.model_brief,
        max_tokens=8000,
        # Rebuild per request so AI-authored primitives (added to
        # KNOWN_PRIMITIVES by the patcher mid-run) appear in subsequent
        # calls. Pass role so wrap-up tone-rules + exemplar are spliced
        # in instead of the intro defaults.
        system=build_system_prompt(role=role),
        tools=[BRIEF_TOOL],
        tool_choice={"type": "tool", "name": "emit_video_intro_brief"},
        messages=[{"role": "user", "content": user_prompt}],
    )

    # Extract the tool-use block.
    tool_use = next(
        (b for b in response.content if getattr(b, "type", None) == "tool_use"), None
    )
    if tool_use is None:
        raise RuntimeError(
            f"Claude did not emit a tool call. stop_reason={response.stop_reason}; "
            f"content blocks: {[getattr(b, 'type', '?') for b in response.content]}"
        )

    partial = tool_use.input  # type: ignore[union-attr]

    # Stitch in the deterministic parts that don't depend on the LLM.
    brief = {
        "version": "0.1.0",
        "lesson_ref": {
            "topic_slug": topic_slug,
            "subtopic_slug": subtopic_slug,
            "lesson_id": None,
            "is_custom": False,
        },
        "topic": partial.get("topic", topic_name),
        "concept": partial["concept"],
        "style": {
            "palette": "white_on_black",
            **partial["style"],
        },
        "narration": {
            "script": partial["narration"]["script"],
            "voice": {
                "provider": "elevenlabs",
                "voice_id": cfg.elevenlabs_voice_id or "${ELEVENLABS_VOICE_ID}",
            },
            "audio_url": None,
            "audio_duration_s": None,
            "word_timings": [],
        },
        "beats": partial["beats"],
        "qa_constraints": {
            "max_dead_frame_seconds": 1.0,
            "dead_frame_brightness_threshold": 10.0,
        },
        "_meta": {
            "generated_by": "agents/video_intro/brief_generator.py",
            "model": cfg.model_brief,
            "role": role,
        },
    }

    return GeneratedBrief(brief=brief, raw_response=response)


def main():
    """CLI: python -m video_intro.brief_generator --topic-slug ... --subtopic-slug ..."""
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--topic-slug", required=True)
    ap.add_argument("--subtopic-slug", required=True)
    ap.add_argument(
        "--topic-name",
        required=True,
        help="Display name e.g. 'Algebra'",
    )
    ap.add_argument(
        "--subtopic-name",
        required=True,
        help="Display name e.g. 'Linear equations (one variable)'",
    )
    ap.add_argument("--target-duration-s", type=float, default=30.0)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    result = generate_brief(
        topic_slug=args.topic_slug,
        subtopic_slug=args.subtopic_slug,
        topic_name=args.topic_name,
        subtopic_name=args.subtopic_name,
        target_duration_s=args.target_duration_s,
    )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result.brief, indent=2))
    print(f"wrote {args.out} ({args.out.stat().st_size} bytes)")
    print(
        f"  beats: {len(result.brief['beats'])}, "
        f"narration: {len(result.brief['narration']['script'].split())} words, "
        f"duration: {result.brief['beats'][-1]['end_s']:.1f}s"
    )


if __name__ == "__main__":
    main()
