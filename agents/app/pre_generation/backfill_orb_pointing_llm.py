"""Backfill `orbFocus` onto cached micro-lessons — LLM pass.

The deterministic pass (scripts/backfill-orb-pointing.ts) handles steps that
literally name a part. This pass handles the rest: geometry prose like "the
longest side" or "the right angle here", where the part is implied. For each
lesson it makes ONE Majordomo-routed Claude call: it offers the model the
diagram's VALID part names (generated from the diagram, so any choice is
resolvable by construction) and the un-annotated discussion steps, and asks
which part each step is about, or "none". Choices outside the offered set are
dropped. Runs only on steps that don't already have orbFocus, so it composes
with the deterministic pass.

Usage:
    cd agents && python -m app.pre_generation.backfill_orb_pointing_llm           # dry-run, LIMIT lessons
    cd agents && LIMIT=0 python -m app.pre_generation.backfill_orb_pointing_llm   # dry-run, all lessons
    cd agents && APPLY=1 python -m app.pre_generation.backfill_orb_pointing_llm   # write all
"""
import json
import os
import re

from dotenv import load_dotenv

load_dotenv(override=True)  # bash sandbox blanks secrets; reload from .env

import anthropic

from app.utils.db import client
from app.utils.llm_client import MAJORDOMO_ENABLED, MAJORDOMO_GATEWAY, _majordomo_headers

APPLY = os.getenv("APPLY") == "1"
LIMIT = int(os.getenv("LIMIT", "6"))  # dry-run preview size; 0 = all
MODEL = os.getenv("ORB_BACKFILL_MODEL", "claude-sonnet-4-6")

POINTABLE = {"geometry", "coordinate_plane", "number_line"}
DISCUSSION = {"write_math", "write_text", "callout"}

sb = client()
anth = (
    anthropic.Anthropic(base_url=MAJORDOMO_GATEWAY, default_headers=_majordomo_headers("orb-backfill"))
    if MAJORDOMO_ENABLED
    else anthropic.Anthropic()
)


def _strip_latex(s: str) -> str:
    s = re.sub(r"\\textcolor\{[^}]*\}", "", s)
    s = re.sub(r"\\htmlClass\{[^}]*\}", "", s)
    s = re.sub(r"\\[a-zA-Z]+", " ", s)
    return re.sub(r"[{}$]", " ", s).strip()


def offered_parts(action: dict) -> list[str]:
    """Valid, human-meaningful part names a diagram exposes (deduped, ordered).
    Mirrors the resolver's accepted forms so any choice resolves."""
    out: list[str] = []
    seen: set[str] = set()

    def add(p: str | None):
        if p and p.strip() and p.strip() not in seen:
            seen.add(p.strip())
            out.append(p.strip())

    t = action.get("type")
    if t == "geometry":
        verts: list[str] = []
        for f in action.get("figures") or []:
            if isinstance(f, dict) and f.get("type") == "polygon" and isinstance(f.get("vertexLabels"), list):
                verts += [str(v) for v in f["vertexLabels"] if isinstance(v, str)]
        for v in verts:
            add(v)
        for i in range(len(verts)):
            for j in range(i + 1, len(verts)):
                add(verts[i] + verts[j])
        for l in action.get("labels") or []:
            txt = l if isinstance(l, str) else (l.get("text") if isinstance(l, dict) else None)
            if txt and (any(ch.isdigit() for ch in txt) or "=" in txt):
                add(txt)
    elif t == "coordinate_plane":
        for el in action.get("elements") or []:
            if not isinstance(el, dict):
                continue
            if el.get("type") == "point":
                if el.get("label"):
                    add(el["label"])
                    m = re.match(r"\s*([A-Za-z][A-Za-z0-9'_]*)", el["label"])
                    if m:
                        add(m.group(1))
                note = el.get("note") or {}
                if isinstance(note, dict) and note.get("text"):
                    add(note["text"])
                at = el.get("at")
                if isinstance(at, list) and len(at) == 2:
                    add(f"({at[0]}, {at[1]})")
            elif el.get("label"):
                add(el["label"])
    elif t == "number_line":
        for p in action.get("points") or []:
            if isinstance(p, dict) and p.get("label") and re.search(r"[\d=]", str(p["label"])):
                add(str(p["label"]))
    return out


def windows(steps: list[dict]):
    """Yield (diagram_step, [discussion steps without orbFocus]) windows. A
    section_heading ends a window (the diagram scrolls away)."""
    ref = None
    bucket: list[dict] = []
    for s in steps:
        t = (s.get("action") or {}).get("type")
        if t in POINTABLE:
            if ref is not None and bucket:
                yield ref, bucket
            ref, bucket = s, []
        elif t == "section_heading":
            if ref is not None and bucket:
                yield ref, bucket
            ref, bucket = None, []
        elif t in DISCUSSION and ref is not None and not s.get("orbFocus"):
            bucket.append(s)
    if ref is not None and bucket:
        yield ref, bucket


PROMPT = """You are annotating a math micro-lesson so an on-screen tutor avatar can walk to the right part of a diagram while it talks.

For each step, pick the ONE part of its diagram the step is mainly about, so the avatar can point at it. Pick a name from that diagram's "available parts" list EXACTLY as written, or "none" if the step is not about a single specific part (e.g. it states a formula, does pure arithmetic, or is a general remark).

{body}

Return ONLY a JSON object mapping each step id (as a string) to a chosen part name or "none". Example: {{"5": "AC", "6": "none"}}."""


def build_body(wins) -> tuple[str, dict[int, set[str]]]:
    """Render the diagrams + steps block, and a map of stepId -> valid parts."""
    valid: dict[int, set[str]] = {}
    lines: list[str] = []
    for di, (ref, bucket) in enumerate(wins, 1):
        parts = offered_parts(ref["action"])
        if not parts:
            continue
        shape = ref["action"].get("type", "diagram").replace("_", " ")
        lines.append(f'Diagram D{di} ({shape}) — available parts: {", ".join(parts)}')
        for s in bucket:
            txt = _strip_latex(s.get("displayText") or (s.get("action") or {}).get("text") or "")
            if not txt:
                continue
            lines.append(f'  [step {s["id"]}] "{txt[:200]}"')
            valid[s["id"]] = set(parts)
        lines.append("")
    return "\n".join(lines), valid


def parse_json(text: str) -> dict:
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return {}


def process_lesson(steps: list[dict]) -> list[tuple[int, int, str]]:
    """Return [(stepId, refStepId, part)] the LLM proposes (validated)."""
    wins = [(ref, bucket) for ref, bucket in windows(steps) if bucket]
    if not wins:
        return []
    body, valid = build_body(wins)
    if not valid:
        return []
    # refStepId per stepId
    ref_of: dict[int, int] = {}
    for ref, bucket in wins:
        for s in bucket:
            ref_of[s["id"]] = ref["id"]

    resp = anth.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": PROMPT.format(body=body)}],
    )
    text = "".join(b.text for b in resp.content if getattr(b, "type", None) == "text")
    choices = parse_json(text)

    out: list[tuple[int, int, str]] = []
    for sid_str, part in choices.items():
        try:
            sid = int(sid_str)
        except (ValueError, TypeError):
            continue
        if not isinstance(part, str) or part.strip().lower() == "none":
            continue
        if sid in valid and part.strip() in valid[sid]:
            out.append((sid, ref_of[sid], part.strip()))
    return out


def main():
    rows = sb.table("micro_lessons").select("id,subtopic_id,whiteboard_steps").execute().data or []
    diagram_rows = [
        r for r in rows
        if any((s.get("action") or {}).get("type") in POINTABLE for s in (r["whiteboard_steps"] or []))
    ]
    if LIMIT and not APPLY:
        diagram_rows = diagram_rows[:LIMIT]

    total_new = 0
    lessons_written = 0
    for r in diagram_rows:
        steps = r["whiteboard_steps"] or []
        try:
            proposals = process_lesson(steps)
        except Exception as e:  # noqa: BLE001 — one lesson failing shouldn't kill the run
            print(f"[orb-llm] {r['subtopic_id'][:8]}: error {e}", flush=True)
            continue
        if not proposals:
            continue
        total_new += len(proposals)
        by_id = {s["id"]: s for s in steps}
        for sid, ref, part in proposals:
            txt = _strip_latex(by_id[sid].get("displayText") or (by_id[sid].get("action") or {}).get("text") or "")
            print(f'[orb-llm] {r["subtopic_id"][:8]} #{sid} -> "{part}" (ref #{ref})  :: {txt[:70]}', flush=True)
            by_id[sid]["orbFocus"] = {"refStepId": ref, "part": part}

        if APPLY:
            sb.table("micro_lessons").update({"whiteboard_steps": steps}).eq("id", r["id"]).execute()
            lessons_written += 1

    print(f"\n[orb-llm] processed {len(diagram_rows)} lesson(s); proposed {total_new} new orbFocus")
    if APPLY:
        print(f"[orb-llm] WROTE {lessons_written} lesson row(s).")
    else:
        print(f"[orb-llm] DRY RUN (LIMIT={LIMIT or 'all'}) — re-run with APPLY=1 to write all.")


if __name__ == "__main__":
    main()
