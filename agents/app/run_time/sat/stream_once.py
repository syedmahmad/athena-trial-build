"""
One-shot variant-aware micro-lesson generator.

Reads a single JSON request body from stdin (same shape as the
/micro-lesson/stream HTTP endpoint), honors MICROLESSON_PROMPT_VARIANT in
the environment (by deferring the agent import until AFTER env is set),
streams whiteboard steps to stdout as one JSON line per step, and exits.

Usage (from a subprocess that sets the env var):
    echo '{"topic":"Algebra","subtopic":"...",...}' | \
    MICROLESSON_PROMPT_VARIANT=c1-reordered python3 -m app.run_time.sat.stream_once

Output format (one JSON object per line):
    {"wb_step": {...}}
    {"wb_step": {...}}
    ...
    {"done": true}
"""

import asyncio
import json
import sys


def _read_request() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        raise SystemExit("stream_once: empty stdin")
    return json.loads(raw)


async def _run() -> int:
    # Import ONLY after env is set (the caller controls MICROLESSON_PROMPT_VARIANT).
    from app.run_time.sat.micro_lesson_agent import generate_micro_lesson_stream
    from main import stream_with_whiteboard  # reuse the existing SSE assembler

    req = _read_request()
    metadata = {
        "description": req.get("description", ""),
        "learning_objectives": req.get("learning_objectives", []),
        "key_formulas": req.get("key_formulas", []),
        "common_mistakes": req.get("common_mistakes", []),
        "tips_and_tricks": req.get("tips_and_tricks", []),
        "conceptual_overview": req.get("conceptual_overview"),
    }

    raw = generate_micro_lesson_stream(
        topic=req.get("topic", ""),
        subtopic=req.get("subtopic", ""),
        subtopic_metadata=metadata,
    )
    async for event in stream_with_whiteboard(raw):
        # stream_with_whiteboard emits SSE "data: {json}\n\n". Extract the JSON.
        if not event.startswith("data: "):
            continue
        payload = event[len("data: "):].strip()
        if payload == "[DONE]":
            continue
        # Pass through tokens / wb_steps / errors as-is on stdout, one per line.
        # Only wb_step and error matter to the TS side; skip token noise.
        try:
            obj = json.loads(payload)
        except Exception:
            continue
        if "wb_step" in obj or "error" in obj:
            sys.stdout.write(payload + "\n")
            sys.stdout.flush()

    sys.stdout.write(json.dumps({"done": True}) + "\n")
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_run()))
