#!/usr/bin/env python3
"""
Convert a brief.json (per reference/brief.schema.json) into a manifest that
Remotion can consume directly via `--props=<manifest.json>` or as a static
import from src/Root.tsx.

This is a thin transform for now — the brief and manifest shapes are nearly
identical. The orchestrator (agents/video_intro/) will gain more responsibility
as it resolves remote asset URLs, runs TTS, and writes word_timings before
calling this script.

Usage:
    python3 scripts/brief_to_manifest.py \
        --brief /Users/craig/athena/video-intro/reference/ex1/brief/brief.json \
        --audio /Users/craig/athena/video-intro/reference/ex1/audio/ex1.wav \
        --out   manifests/ex1-stub.json
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--brief", required=True, type=Path)
    ap.add_argument(
        "--audio",
        type=Path,
        help="Local audio file to copy into public/ for Remotion staticFile() resolution.",
    )
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument(
        "--strip-captions",
        action="store_true",
        help=(
            "Drop every `caption`-kind overlay from each beat. Use when the "
            "narration will be spoken live by the app's TTS tutor (chosen "
            "voice) instead of baked into the video — the on-screen subtitle "
            "would otherwise duplicate the spoken line and clash with a "
            "user-selected voice. `math` / `label` / `callout` overlays are "
            "on-canvas teaching content and are kept."
        ),
    )
    args = ap.parse_args()

    brief = json.loads(args.brief.read_text())

    # The manifest is the brief plus a `render` block with locally-resolved
    # asset paths. Future versions will add resolved audio_url + word_timings
    # in-place after TTS runs.
    manifest = dict(brief)

    if args.strip_captions:
        stripped = 0
        for beat in manifest.get("beats", []):
            overlays = beat.get("overlays")
            if not overlays:
                continue
            kept = [ov for ov in overlays if ov.get("kind") != "caption"]
            stripped += len(overlays) - len(kept)
            beat["overlays"] = kept
        print(f"  stripped {stripped} caption overlay(s)")

    if args.audio:
        public_dir = args.out.parent.parent / "public"
        public_dir.mkdir(parents=True, exist_ok=True)
        dest = public_dir / args.audio.name
        if not dest.exists() or dest.stat().st_size != args.audio.stat().st_size:
            shutil.copy2(args.audio, dest)
        manifest["render"] = {
            **manifest.get("render", {}),
            "audio_path_local": args.audio.name,
        }

    # Derive a duration override if none present.
    if not manifest.get("render", {}).get("duration_s"):
        if manifest["beats"]:
            manifest.setdefault("render", {})["duration_s"] = manifest["beats"][-1]["end_s"]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    # IMPORTANT: Remotion's --props merges at the top level. The component
    # expects a single `manifest` prop, so we wrap the JSON.
    args.out.write_text(json.dumps({"manifest": manifest}, indent=2))
    print(f"wrote {args.out} ({args.out.stat().st_size} bytes)")
    print(f"  duration_s: {manifest['render']['duration_s']}")
    if "audio_path_local" in manifest.get("render", {}):
        print(f"  audio: public/{manifest['render']['audio_path_local']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
