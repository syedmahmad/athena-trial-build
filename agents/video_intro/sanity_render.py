"""
5-frame sanity render for AI-authored primitives.

After a new primitive's .tsx is written + registration files are
patched, this module:

  1. Runs `npx tsc --noEmit` on the Remotion subproject to catch
     TypeScript errors.
  2. Stages a synthetic 1-beat manifest that uses just the new
     primitive with the proposed example_props.
  3. Renders 5 frames (~0.17s at 30fps) to a temp directory.
  4. Returns success/failure + the captured stderr for re-prompting.

If sanity fails, the caller (cmd_generate) re-prompts Claude with the
error log included; up to 3 retries. After 3 failures, the orchestrator
reverts the patch + leaves the beat without `code` (renders as black,
caught by the QA gate at final render time).
"""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class SanityResult:
    ok: bool
    stage: str  # "tsc" | "render" | "missing-output"
    stderr: str = ""

    def short(self) -> str:
        if self.ok:
            return "PASS"
        tail = "\n".join(self.stderr.strip().splitlines()[-30:])
        return f"FAIL ({self.stage})\n{tail}"


def sanity_render(
    *,
    name: str,
    example_props: dict[str, Any],
    remotion_root: Path,
    timeout_s: float = 90.0,
) -> SanityResult:
    """Validate a freshly-authored primitive by typechecking + rendering
    5 frames. Returns SanityResult; caller uses result.ok and
    result.stderr to decide whether to retry.
    """
    # 1) Typecheck the Remotion subproject (excludes Next.js root, fast).
    tsc = subprocess.run(
        ["npx", "tsc", "--noEmit"],
        cwd=remotion_root,
        capture_output=True,
        text=True,
        timeout=timeout_s,
    )
    if tsc.returncode != 0:
        return SanityResult(
            ok=False,
            stage="tsc",
            stderr=(tsc.stdout or "") + "\n" + (tsc.stderr or ""),
        )

    # 2) Stage a 1-beat synthetic manifest. Uses no audio so the render
    #    completes purely from primitive props.
    manifest = _build_synthetic_manifest(name=name, example_props=example_props)
    manifest_path = remotion_root / "manifests" / f"__sanity_{name}.json"
    manifest_path.write_text(json.dumps({"manifest": manifest}, indent=2))

    try:
        # 3) Render 5 frames (frames 0..4) to a temp dir.
        with tempfile.TemporaryDirectory() as td:
            out_mp4 = Path(td) / f"__sanity_{name}.mp4"
            render = subprocess.run(
                [
                    "npx",
                    "remotion",
                    "render",
                    "src/index.ts",
                    "IntroVideo",
                    str(out_mp4),
                    f"--props=./manifests/__sanity_{name}.json",
                    "--frames=0-4",
                ],
                cwd=remotion_root,
                capture_output=True,
                text=True,
                timeout=timeout_s,
            )
            if render.returncode != 0:
                return SanityResult(
                    ok=False,
                    stage="render",
                    stderr=(render.stdout or "") + "\n" + (render.stderr or ""),
                )
            if not out_mp4.exists():
                return SanityResult(
                    ok=False,
                    stage="missing-output",
                    stderr="render exited 0 but no MP4 was produced",
                )
            return SanityResult(ok=True, stage="render")
    finally:
        # Clean up the synthetic manifest so it doesn't pollute the
        # /dev/lesson-intros preview list or the manifests directory.
        try:
            manifest_path.unlink()
        except FileNotFoundError:
            pass


def _build_synthetic_manifest(*, name: str, example_props: dict[str, Any]) -> dict[str, Any]:
    """Minimum-viable manifest with one beat that uses the new primitive
    at the proposed props. No audio, no overlays, 1s long — enough to
    render 5 frames and exercise the component's setup + first-frame
    paint."""
    return {
        "version": "0.1.0",
        "lesson_ref": {
            "topic_slug": "_sanity",
            "subtopic_slug": name,
            "lesson_id": None,
            "is_custom": False,
        },
        "topic": "sanity render — do not commit",
        "concept": {
            "math_concept": f"smoke test for the {name} primitive",
            "real_world_analog": "n/a",
            "style_strategy": "literal",
        },
        "style": {
            "palette": "white_on_black",
            "background_motif": "blank",
            "anchor_objects": [],
        },
        "narration": {
            "script": "",
            "voice": {"provider": "elevenlabs", "voice_id": "n/a"},
            "audio_url": None,
            "audio_duration_s": None,
            "word_timings": [],
        },
        "beats": [
            {
                "id": "b1_sanity",
                "start_s": 0.0,
                "end_s": 1.0,
                "narration_span": "",
                "visual": {
                    "primary": f"sanity render of {name}",
                    "renderer_hint": {
                        "code": {
                            "primitive": name,
                            "props": example_props,
                        },
                    },
                },
                "overlays": [],
            }
        ],
        "render": {
            "duration_s": 1.0,
        },
    }
