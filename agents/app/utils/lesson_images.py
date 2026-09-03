"""Curated open-license image selection for general-subject lessons.

Shared by the bulk seeder (``app/pre_generation/seed_lesson_images.py``) and
the live lesson-generation endpoint (``main.py`` → ``/micro-lesson/stream``).
For a subtopic, a small model writes a precise Wikimedia Commons search
query; we fetch the top free-licensed candidates (CC0 / public-domain /
CC-BY[-SA]); the model then picks the one that is a clearly relevant
educational illustration (rejecting book covers, logos, seals, emblems and
off-topic matches). ``build_image_action`` returns a ready-to-emit ``image``
whiteboard step (sans ``id`` — the client assigns one), carrying attribution
as required for CC-BY.

Best-effort by contract: ``build_image_action`` never raises and returns
``None`` whenever nothing clearly relevant is found or any error occurs — a
lesson is always valid without an image, so callers treat a missing image as
normal.
"""

import asyncio
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from agno.agent import Agent

from app.utils.llm_client import claude

_UA = "AthenaEducation/1.0 (educational micro-lessons; contact: support@athena)"
_FREE = ("cc0", "public domain", "cc by", "cc-by", "creative commons", "attribution", "pd")
_SKIP = (".ogg", ".gif", ".webm", ".pdf", ".mid", ".oga", ".svg.png")

# Subjects that keep SAT / math framing — never get a curated image.
SAT_SUBJECTS = ("math", "reading-writing")

_agent_singleton = None


def _agent() -> Agent:
    global _agent_singleton
    if _agent_singleton is None:
        _agent_singleton = Agent(
            name="Lesson Image Curator",
            model=claude(id="claude-haiku-4-5-20251001", feature="lesson-image"),
            instructions=["Answer with ONLY what is requested — no preamble, no quotes."],
            markdown=False,
        )
    return _agent_singleton


def _strip_html(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def _simplify(subtopic: str) -> str:
    """A plainer fallback query — drop parentheticals and punctuation."""
    return re.sub(r"\s+", " ", re.sub(r"[(),]", " ", subtopic or "")).strip()


async def suggest_query(topic: str, subtopic: str, subject: str) -> str:
    """Ask the model for a precise, depictable Commons search query."""
    prompt = (
        f"Subject: {subject}. Topic: {topic}. Subtopic: {subtopic}.\n"
        "Give a 2-to-5 word search query for Wikimedia Commons to find ONE clear, accurate "
        "educational illustration, diagram, photo, map, or historical artifact for this subtopic. "
        "Choose something concrete and depictable (e.g. 'Newton's laws diagram', 'medieval castle', "
        "'separation of powers diagram', 'supply and demand curve'). Output ONLY the query."
    )
    try:
        r = await _agent().arun(prompt)
        q = _strip_html(getattr(r, "content", "") or "").strip('"').strip()
        return q[:80] or subtopic
    except Exception:
        return _simplify(subtopic)


async def pick_relevant(subtopic: str, titles: list[str]) -> int:
    """Have the model pick the clearly-relevant candidate index, or -1."""
    listing = "\n".join(f"{i}: {t}" for i, t in enumerate(titles))
    prompt = (
        f"Subtopic being taught: {subtopic}\n"
        f"Candidate Wikimedia Commons image titles:\n{listing}\n\n"
        "Pick the ONE that is a clearly relevant, accurate educational illustration of this subtopic. "
        "REJECT book/journal covers, logos, emblems, seals, certificates, coincidental word matches, "
        "and anything off-topic. Reply with ONLY the candidate number, or -1 if none clearly fit."
    )
    try:
        r = await _agent().arun(prompt)
        m = re.search(r"-?\d+", getattr(r, "content", "") or "")
        return int(m.group()) if m else -1
    except Exception:
        return 0  # fall back to the top search result


def wiki_candidates(query: str, limit: int = 8) -> list[dict]:
    """Return free-licensed Commons image candidates for a query (search rank).

    Synchronous (urllib) — call via ``asyncio.to_thread`` from async code.
    """
    import json as _json

    params = {
        "action": "query",
        "generator": "search",
        "gsrsearch": query,
        "gsrnamespace": "6",
        "gsrlimit": str(limit),
        "prop": "imageinfo",
        "iiprop": "url|extmetadata",
        "iiurlwidth": "900",
        "format": "json",
    }
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    data = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                data = _json.load(r)
            break
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:  # Commons rate-limits bursts
                time.sleep(6 * (attempt + 1))
                continue
            raise
    pages = list(((data or {}).get("query") or {}).get("pages", {}).values())
    pages.sort(key=lambda p: p.get("index", 99))
    out = []
    for p in pages:
        ii = (p.get("imageinfo") or [{}])[0]
        thumb = ii.get("thumburl")
        title = p.get("title", "")
        low = title.lower()
        if not thumb or "icon" in low or "logo" in low:
            continue
        if any(low.endswith(ext) or ext in low for ext in _SKIP):
            continue
        em = ii.get("extmetadata", {}) or {}
        lic = _strip_html((em.get("LicenseShortName") or {}).get("value", ""))
        if lic and not any(f in lic.lower() for f in _FREE):
            continue
        artist = _strip_html((em.get("Artist") or {}).get("value", ""))
        if len(artist) > 60:
            artist = artist[:57] + "…"
        desc = ii.get("descriptionurl") or (
            "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_"))
        )
        out.append({
            "src": thumb,
            "title": title,
            "attribution": " · ".join([x for x in [artist or None, lic or None, "Wikimedia Commons"] if x]),
            "sourceUrl": desc,
        })
    return out


async def build_image_action(
    topic: str,
    subtopic: str,
    subject: str,
    *,
    pace: float = 0.0,
) -> dict | None:
    """Run the full select-an-image pipeline for one subtopic.

    Returns ``{"step": <whiteboard step dict, no id>, "title": <chosen
    Commons title>}`` or ``None``. The ``step`` is ready to emit/insert: it
    has ``action`` (``type: "image"`` with ``src`` / ``alt`` / ``attribution``
    / ``sourceUrl``), ``narration`` and ``displayText``. ``title`` is a
    logging sidecar only — it is not part of the step.

    ``pace`` inserts a gentle delay before each Commons fetch; the bulk seeder
    passes a positive value to stay under Wikimedia's burst rate limit, while
    the runtime path (a single lesson) leaves it at 0.

    Never raises — SAT/math subjects and any failure return ``None``.
    """
    if subject in SAT_SUBJECTS:
        return None
    try:
        query = await suggest_query(topic, subtopic, subject)
        if pace:
            await asyncio.sleep(pace)
        cands = await asyncio.to_thread(wiki_candidates, query)
        if len(cands) < 3:  # broaden with a simpler query for more options
            fallback = _simplify(subtopic)
            if fallback.lower() != query.lower():
                if pace:
                    await asyncio.sleep(pace)
                extra = await asyncio.to_thread(wiki_candidates, fallback)
                seen = {c["title"] for c in cands}
                cands += [c for c in extra if c["title"] not in seen]
        if not cands:
            return None
        idx = await pick_relevant(subtopic, [c["title"] for c in cands])
        if idx < 0 or idx >= len(cands):
            return None
        img = cands[idx]
        step = {
            "action": {
                "type": "image",
                "src": img["src"],
                "alt": f"{subtopic} (illustration)",
                "attribution": img["attribution"],
                "sourceUrl": img["sourceUrl"],
            },
            "narration": f"Here's a real illustration of {subtopic.lower()}.",
            "displayText": subtopic,
        }
        return {"step": step, "title": img["title"]}
    except Exception as e:  # best-effort: a lesson is fine without an image
        print(f"[lesson_images] {subtopic!r}: {type(e).__name__}: {e}", file=sys.stderr, flush=True)
        return None
