#!/usr/bin/env python3
"""
QA gate for a rendered intro MP4 — flags dead-frame seconds where the visual
goes dark while audio is still active. This is the failure mode we quantified
in ex2 (~13s gap) and ex3 (~20s gap); pipeline must never produce this.

Usage:
    python3 scripts/qa_gate.py out/ex1.mp4

Exits 0 on pass, 1 on fail. Prints a per-second analysis and verdict.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


def _per_second_brightness(mp4: Path, fps_sample: int = 1) -> list[float]:
    """Sample one frame per second (default), return mean grayscale per sample."""
    from PIL import Image  # lazy import — only needed for QA, not for build
    import numpy as np

    with tempfile.TemporaryDirectory() as td:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-v",
                "error",
                "-i",
                str(mp4),
                "-vf",
                f"fps={fps_sample},scale=160:90",
                "-q:v",
                "2",
                f"{td}/f%04d.png",
            ],
            check=True,
        )
        vals = []
        for fn in sorted(os.listdir(td)):
            arr = np.array(Image.open(f"{td}/{fn}").convert("L"))
            vals.append(float(arr.mean()))
    return vals


def _audio_active_per_second(mp4: Path) -> list[bool]:
    """Sample audio RMS energy per second. True if speech-likely (above noise floor)."""
    out = subprocess.run(
        [
            "ffmpeg",
            "-i",
            str(mp4),
            "-af",
            "astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
    )
    rms = []
    for line in out.stderr.splitlines():
        if "RMS_level=" in line:
            try:
                v = float(line.split("=")[-1])
                rms.append(v)
            except ValueError:
                pass
    # ffmpeg's astats with reset=1 produces ~one reading per audio frame; bin by second.
    # Heuristic: audio active when RMS > -40 dB.
    # Aggregate readings into per-second buckets is approximate; we just check
    # whether ANY reading in a 1s window is above the floor.
    if not rms:
        return []
    # rms is roughly per audio frame. We don't know exact frame rate cleanly;
    # bin by len(rms)/duration.
    duration = _ffprobe_duration(mp4)
    bins = max(1, int(duration))
    out_bins = [False] * bins
    if len(rms) == 0:
        return out_bins
    step = len(rms) / bins
    for i in range(bins):
        chunk = rms[int(i * step) : max(int((i + 1) * step), int(i * step) + 1)]
        if any(r > -40 for r in chunk):
            out_bins[i] = True
    return out_bins


def _ffprobe_duration(mp4: Path) -> float:
    out = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(mp4),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return float(out.stdout.strip())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("mp4", type=Path)
    ap.add_argument("--brightness-threshold", type=float, default=10.0)
    ap.add_argument("--max-dead-frame-seconds", type=float, default=1.0)
    ap.add_argument("--report", type=Path, help="Write a JSON report to this path")
    args = ap.parse_args()

    if not args.mp4.exists():
        print(f"file not found: {args.mp4}", file=sys.stderr)
        return 2

    duration = _ffprobe_duration(args.mp4)
    print(f"file: {args.mp4} ({duration:.2f}s)")
    brightness = _per_second_brightness(args.mp4)
    audio_active = _audio_active_per_second(args.mp4)

    print(f"\nper-second analysis (length: brightness={len(brightness)}, audio={len(audio_active)}):")
    print(f"{'sec':>4}  {'brightness':>10}  {'audio':>5}  {'flag':>5}")
    dead_seconds: list[int] = []
    for i, b in enumerate(brightness):
        active = audio_active[i] if i < len(audio_active) else False
        flagged = b < args.brightness_threshold and active
        if flagged:
            dead_seconds.append(i)
        flag_mark = "DEAD" if flagged else ""
        print(f"{i:>4}  {b:>10.1f}  {str(active):>5}  {flag_mark:>5}")

    # Aggregate contiguous dead seconds.
    max_run = 0
    cur_run = 0
    for i in range(len(brightness)):
        if i in dead_seconds:
            cur_run += 1
            max_run = max(max_run, cur_run)
        else:
            cur_run = 0

    verdict = "PASS" if max_run <= args.max_dead_frame_seconds else "FAIL"
    print(f"\nlongest contiguous dead-frame run: {max_run}s  (limit {args.max_dead_frame_seconds}s)")
    print(f"VERDICT: {verdict}")

    if args.report:
        args.report.write_text(
            json.dumps(
                {
                    "file": str(args.mp4),
                    "duration_s": duration,
                    "brightness_per_second": brightness,
                    "audio_active_per_second": audio_active,
                    "dead_seconds": dead_seconds,
                    "longest_dead_run_s": max_run,
                    "verdict": verdict,
                },
                indent=2,
            )
        )
        print(f"report written: {args.report}")

    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
