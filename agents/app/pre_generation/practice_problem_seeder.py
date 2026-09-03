"""
Bulk practice problem generator — generates a large set of practice problems
for a given topic/subtopic and persists them to the practice_problems table.

Strategy:
  - Split `count` evenly into easy / medium / hard buckets.
  - For each bucket, generate ceil(bucket_size / BATCH_SIZE) batches.
  - All batches across all difficulties run concurrently (capped by semaphore).
"""

import asyncio
import math

from app.pre_generation.problem_generator import generate_problems_batch, BATCH_SIZE

# Max concurrent LLM calls — 6 keeps throughput high without hammering the API
CONCURRENCY = 6


async def generate_practice_problems(
    topic: str,
    subtopic: str,
    subject: str = "math",
    count: int = 60,
    subtopic_id: str | None = None,
    start_order_index: int = 0,
    topic_slug: str | None = None,
    subtopic_slug: str | None = None,
) -> list[dict]:
    """
    Generate `count` practice problems for a topic/subtopic and persist them
    to the practice_problems table (separate from sat_problems).

    Problems are split evenly across easy / medium / hard and generated in
    parallel batches for speed and variety.

    topic_slug / subtopic_slug: pass the DB-sourced slugs directly; if omitted
    they are derived from the topic/subtopic display names.
    """
    if topic_slug is None or subtopic_slug is None:
        from app.pre_generation.content_workflow import _make_slug
        topic_slug = topic_slug or _make_slug(topic)
        subtopic_slug = subtopic_slug or _make_slug(subtopic)

    # ── Split count into equal difficulty buckets ──────────────────────────
    per_difficulty = count // 3
    remainders = count % 3
    # distribute any remainder to easy first, then medium
    buckets = {
        "easy": per_difficulty + (1 if remainders > 0 else 0),
        "medium": per_difficulty + (1 if remainders > 1 else 0),
        "hard": per_difficulty,
    }

    sem = asyncio.Semaphore(CONCURRENCY)

    async def run_batch(difficulty: str, batch_num: int, batch_size: int, order_start: int) -> list[dict]:
        async with sem:
            return await generate_problems_batch(
                subtopic_name=subtopic,
                topic_name=topic,
                subtopic_id=subtopic_id or "practice",
                batch_number=batch_num,
                difficulty=difficulty,
                batch_size=batch_size,
                start_order_index=order_start,
                subject=subject,
            )

    # ── Build all tasks ────────────────────────────────────────────────────
    # Order indices are assigned globally across difficulties so that easy
    # problems fill indices 0..E-1, medium E..E+M-1, hard E+M..total-1.
    tasks: list[tuple[str, asyncio.Task]] = []
    global_offset = start_order_index

    for difficulty, bucket_count in buckets.items():
        num_batches = math.ceil(bucket_count / BATCH_SIZE)
        diff_offset = global_offset
        for batch_num in range(num_batches):
            already = batch_num * BATCH_SIZE
            remaining = bucket_count - already
            this_batch = min(BATCH_SIZE, remaining)
            task = asyncio.create_task(
                run_batch(difficulty, batch_num, this_batch, diff_offset + already)
            )
            tasks.append((difficulty, task))
        global_offset += bucket_count

    # ── Await all tasks concurrently ───────────────────────────────────────
    all_problems: list[dict] = []
    results = await asyncio.gather(*[t for _, t in tasks], return_exceptions=True)

    for (difficulty, _), result in zip(tasks, results):
        if isinstance(result, Exception):
            print(f"  ❌ batch failed ({difficulty}): {result}", flush=True)
        else:
            all_problems.extend(result)
            print(
                f"  ✅ {difficulty}: +{len(result)} problems (total {len(all_problems)})",
                flush=True,
            )

    # ── Tag and persist ────────────────────────────────────────────────────
    for p in all_problems:
        p["topic_slug"] = topic_slug
        p["subtopic_slug"] = subtopic_slug
        if subtopic_id:
            p["subtopic_id"] = subtopic_id
        else:
            p.pop("subtopic_id", None)

    from app.utils.db import save_practice_problems
    save_practice_problems(all_problems)

    return all_problems
