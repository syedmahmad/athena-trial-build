"""Attach one curated open-license image to each general-subject micro-lesson.

This is the BULK seeder: it walks every cached Science / Social-Studies
micro-lesson and inserts an ``image`` whiteboard step after the opening
section heading. The actual image selection (model-written query → Wikimedia
Commons candidates → model relevance pick) lives in
``app.utils.lesson_images`` and is shared with the live lesson-generation
endpoint, so freshly generated lessons get images by the same logic.

Idempotent: skips lessons that already have an image step. Set
SEED_IMAGES_FORCE=1 to re-evaluate and replace existing image steps.

Usage:
    cd agents && python -m app.pre_generation.seed_lesson_images
    cd agents && SEED_IMAGES_FORCE=1 python -m app.pre_generation.seed_lesson_images
"""

import asyncio
import os

from dotenv import load_dotenv

load_dotenv()

from app.utils.db import client
from app.utils.lesson_images import build_image_action

_CONCURRENCY = 1  # serial — Wikimedia rate-limits bursts (HTTP 429)
_FORCE = os.getenv("SEED_IMAGES_FORCE") == "1"

sb = client()


def upsert_image_step(steps: list, new_step: dict) -> list:
    """Remove any existing image step, then insert ``new_step`` (an image
    whiteboard step, sans id) after the first section heading (else near the
    top), assigning it a fresh id."""
    steps = [s for s in steps if (s.get("action") or {}).get("type") != "image"]
    new_id = max((s.get("id", 0) for s in steps), default=-1) + 1
    step = {"id": new_id, **new_step}
    pos = 1
    for i, s in enumerate(steps):
        if (s.get("action") or {}).get("type") == "section_heading":
            pos = i + 1
            break
    return steps[:pos] + [step] + steps[pos:]


async def process(sem: asyncio.Semaphore, s: dict, tname: str, subject: str):
    async with sem:
        slug = s["slug"]
        res = (
            sb.table("micro_lessons").select("subtopic_id,whiteboard_steps")
            .eq("subtopic_id", s["id"]).limit(1).execute().data
        )
        if not res:
            print(f"{slug}: no cached lesson, skip", flush=True)
            return
        steps = res[0]["whiteboard_steps"] or []
        has_img = any((st.get("action") or {}).get("type") == "image" for st in steps)
        if has_img and not _FORCE:
            print(f"{slug}: already has image, skip", flush=True)
            return

        built = await build_image_action(tname, s["name"], subject, pace=1.0)
        if not built:
            # No good match. Under force, strip any stale image so a wrong one
            # from an earlier run is never left behind.
            if _FORCE and has_img:
                cleaned = [st for st in steps if (st.get("action") or {}).get("type") != "image"]
                sb.table("micro_lessons").update({"whiteboard_steps": cleaned}).eq("subtopic_id", s["id"]).execute()
                print(f"{slug}: no good image — removed stale", flush=True)
            else:
                print(f"{slug}: no good image", flush=True)
            return

        new_steps = upsert_image_step(steps, built["step"])
        sb.table("micro_lessons").update({"whiteboard_steps": new_steps}).eq("subtopic_id", s["id"]).execute()
        attr = built["step"]["action"].get("attribution", "")
        print(f"{slug}: + {built['title'][:46]}  [{attr[:42]}]", flush=True)


async def main():
    topics = sb.table("topics").select("id,name,subject").in_("subject", ["science", "social-studies"]).execute().data
    tmeta = {t["id"]: (t["name"], t["subject"]) for t in topics}
    subs = sb.table("subtopics").select("id,slug,name,topic_id").in_("topic_id", list(tmeta)).execute().data
    print(f"attaching images to {len(subs)} lessons (force={_FORCE}, concurrency {_CONCURRENCY})", flush=True)
    sem = asyncio.Semaphore(_CONCURRENCY)
    await asyncio.gather(*[process(sem, s, *tmeta[s["topic_id"]]) for s in subs])
    print("ALL DONE", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
