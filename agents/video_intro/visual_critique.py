"""
Visual critique loop for AI-authored primitives.

After sanity_render passes (tsc clean + frames 0-4 render), the
orchestrator calls into this module to render a single representative
mid-beat frame and submit it to a vision-capable Claude for a pass/fail
verdict. If the verdict is fail, the rationale is fed back into
revise_primitive as the error log — same retry machinery the tsc/render
failures already use.

The critic looks ONLY at hard composition rules (broken shapes, floating
fragments, elements off canvas, doesn't match spec). It does not pass
aesthetic judgment ("is this beautiful?") — that would lead to infinite
revision loops since aesthetics are unbounded.

Costs ~1 LLM vision call (~$0.02-0.05) and ~5-10s render per critique.
Disable with --skip-visual-critique for fast iteration loops.
"""
from __future__ import annotations

import base64
import json
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pathlib import Path as _Path

sys.path.insert(0, str(_Path(__file__).resolve().parent.parent))
from app.utils.llm_client import anthropic_client  # noqa: E402

from .config import Config  # noqa: E402
from .sanity_render import _build_synthetic_manifest  # noqa: E402

# Model comes from Config.model_critique (env var VIDEO_INTRO_MODEL_CRITIQUE,
# defaults to DEFAULT_MODEL in config.py). The critic is a vision quality
# gate — set the env var to an Opus-tier model for production runs.

# Frame to render for the critique. The sanity-render synthetic manifest
# is 1 second long at 30fps; frame 15 is mid-beat — late enough that
# fade-ins have settled, early enough that loop-style animations haven't
# fully cycled. Good representative still.
CRITIQUE_FRAME = 15


@dataclass
class CritiqueResult:
    ok: bool
    rationale: str  # short note on pass; specific actionable critique on fail
    failure_categories: list[str]  # which rules were violated; empty if ok


CRITIQUE_TOOL: dict[str, Any] = {
    "name": "emit_primitive_critique",
    "description": (
        "Emit a pass/fail verdict on a rendered primitive frame. PASS only "
        "if the frame has no violations of the hard composition rules. FAIL "
        "with specific rationale otherwise."
    ),
    "input_schema": {
        "type": "object",
        "required": ["verdict", "rationale", "failure_categories"],
        "properties": {
            "verdict": {
                "type": "string",
                "enum": ["pass", "fail"],
                "description": (
                    "PASS = no composition violations and the frame is a "
                    "recognizable rendering of what the spec asked for. "
                    "FAIL = at least one composition rule violated or the "
                    "frame is unrecognizable / doesn't match spec."
                ),
            },
            "rationale": {
                "type": "string",
                "description": (
                    "On PASS: one-sentence positive note (e.g. 'Clean "
                    "centered bar chart with labels, single focal point'). "
                    "On FAIL: SPECIFIC actionable critique the author can "
                    "act on (e.g. 'The IV bag shape on the left is "
                    "fragmented into disconnected rectangles; replace with "
                    "a simpler bar-chart abstraction of mg/kg vs total "
                    "dose'). Do NOT say 'looks bad' or 'needs improvement' "
                    "without specifics — the author cannot act on vague "
                    "feedback."
                ),
            },
            "failure_categories": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": [
                        "elements_off_canvas",
                        "broken_or_fragmented_shapes",
                        "floating_fragments",
                        "competing_focal_points",
                        "unrecognizable_composition",
                        "doesnt_match_spec",
                        "illegible_text_artifacts",
                        "attempted_photoreal_figure",
                    ],
                },
                "description": (
                    "List the SPECIFIC rules violated. Empty list ONLY if "
                    "verdict=pass. Use these categories from the author's "
                    "composition rules in the system prompt — do not "
                    "invent new ones."
                ),
            },
        },
    },
}


SYSTEM_PROMPT = """You are a strict visual critic for the Athena lesson-intro video pipeline. You look at a single rendered frame of a Remotion primitive and decide whether the primitive meets the hard composition bar.

Your job is to catch the kinds of problems an AI primitive author makes when it tries to draw something complicated:
- Fragmented shapes that look like AI-art mess instead of clean technical illustration
- Disconnected elements scattered across the canvas
- Attempted figures (people, animals, vehicles) drawn from primitive shapes that read as garbled
- Compositions with 3+ unrelated objects competing for attention
- Elements clipped by or extending past the canvas edge
- Rectangular outlines containing illegible internal strokes (a "form" with random horizontal lines that don't spell anything)
- Shapes that look like other shapes by accident

PASS the frame if:
- One clear focal point
- All shapes connected or visually related
- Stays inside the canvas (bounding box ≥ 200px from each edge)
- Recognizable abstraction of what the spec asked for (even if simplified)
- Clean technical-illustration style

You are NOT judging aesthetics ("is this beautiful?"). You are checking hard rules. A simple bar chart that does the job cleanly is a PASS. A fancy attempted scene that's fragmented is a FAIL.

When in doubt, PASS — false negatives waste retry budget. Only FAIL when you can point to a specific rule violation."""


def capture_critique_frame(
    *,
    name: str,
    example_props: dict[str, Any],
    remotion_root: Path,
    frame: int = CRITIQUE_FRAME,
    timeout_s: float = 90.0,
) -> Path | None:
    """Render a single PNG frame of the primitive at `frame` (default 15
    = 0.5s into a 30fps beat). Returns the path on success, None on
    render failure. Caller is responsible for cleanup; we write into a
    persistent temp file so the caller can keep the path around for
    debug logging on critique failure.

    Uses the same synthetic-manifest staging pattern as sanity_render so
    the rendered frame uses ONLY the primitive under test with the
    proposed example_props — no other beats, no audio, no overlays."""
    manifest = _build_synthetic_manifest(name=name, example_props=example_props)
    manifest_path = remotion_root / "manifests" / f"__critique_{name}.json"
    manifest_path.write_text(json.dumps({"manifest": manifest}, indent=2))

    # Persistent (not auto-deleted) temp file so callers can attach it
    # to debug logs / surface it to the user on failure.
    tmp = tempfile.NamedTemporaryFile(
        prefix=f"critique_{name}_frame{frame}_",
        suffix=".png",
        delete=False,
    )
    out_png = Path(tmp.name)
    tmp.close()

    try:
        result = subprocess.run(
            [
                "npx",
                "remotion",
                "still",
                "src/index.ts",
                "IntroVideo",
                str(out_png),
                f"--props=./manifests/__critique_{name}.json",
                f"--frame={frame}",
            ],
            cwd=remotion_root,
            capture_output=True,
            text=True,
            timeout=timeout_s,
        )
        if result.returncode != 0 or not out_png.exists() or out_png.stat().st_size == 0:
            # Render failed; clean up the empty PNG and surface None.
            try:
                out_png.unlink()
            except FileNotFoundError:
                pass
            return None
        return out_png
    finally:
        try:
            manifest_path.unlink()
        except FileNotFoundError:
            pass


def critique_primitive(
    *,
    name: str,
    description: str,
    use_case: str,
    props_schema: dict[str, Any],
    frame_path: Path,
    config: Config | None = None,
) -> CritiqueResult:
    """Send the rendered frame + the original spec to Claude vision for
    pass/fail. Returns CritiqueResult — caller routes fail results into
    revise_primitive with the rationale as the error log.

    Raises RuntimeError if Claude doesn't return a tool call (network
    glitch or model misuse). Callers should treat that as a transient
    failure and probably skip the critique step rather than failing the
    primitive — there's no actionable signal in that case."""
    cfg = config or Config.from_env()
    cfg.require_anthropic()
    client = anthropic_client(feature="video-intro-visual-critique")

    image_b64 = base64.b64encode(frame_path.read_bytes()).decode("ascii")

    user_text = f"""Critique this rendered primitive frame against its spec.

# Spec

snake_case name: `{name}`
description: {description}
use case: {use_case}
props schema (TypeScript-like):
{json.dumps(props_schema, indent=2)}

# The rendered frame

Attached. This is frame {CRITIQUE_FRAME} of a 30fps beat — 0.5s in, after most fade-in animations have settled. The black background is normal (provided by the composition); the primitive draws white linework on top.

# Verdict

Emit the verdict via `emit_primitive_critique`. PASS only if the frame has no composition violations and is a recognizable rendering of what the spec asked for. FAIL with a SPECIFIC actionable critique otherwise — pointing to the rule violated and suggesting a simpler / cleaner alternative composition the author can implement.

If the frame is mostly empty (no primitive content visible, just black background), that's a FAIL with category `unrecognizable_composition` and rationale "frame is empty — the primitive is likely not drawing anything visible at frame {CRITIQUE_FRAME}; check that animations have started and elements are positioned inside the visible canvas." """

    response = client.messages.create(
        model=cfg.model_critique,
        max_tokens=1500,
        system=SYSTEM_PROMPT,
        tools=[CRITIQUE_TOOL],
        tool_choice={"type": "tool", "name": "emit_primitive_critique"},
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": image_b64,
                        },
                    },
                    {"type": "text", "text": user_text},
                ],
            }
        ],
    )

    tool_use = next(
        (b for b in response.content if getattr(b, "type", None) == "tool_use"),
        None,
    )
    if tool_use is None:
        raise RuntimeError(
            f"visual critique returned no tool call. stop_reason={response.stop_reason}; "
            f"content blocks: {[getattr(b, 'type', '?') for b in response.content]}"
        )

    args = tool_use.input  # type: ignore[union-attr]
    verdict = args["verdict"]
    return CritiqueResult(
        ok=(verdict == "pass"),
        rationale=args["rationale"],
        failure_categories=args.get("failure_categories", []),
    )
