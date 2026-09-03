"""
Full SAT problem bank seeder — generates problems for every subtopic
using the existing generate_problems_batch() pipeline, tagged with
source='full_sat'.

Usage:
    cd agents && python -m cli.main seed-full-sat-bank
    cd agents && python -m cli.main seed-full-sat-bank --subject all --count 50
"""

import asyncio
import math
import time

from app.pre_generation.problem_generator import generate_problems_batch, BATCH_SIZE
from app.pre_generation.content_workflow import MATH_CONTENT_MAP, RW_CONTENT_MAP, _make_slug
from app.utils.db import (
    get_topic_by_slug,
    get_subtopic,
    get_full_sat_problem_count,
    save_full_sat_problems,
)

# Target problems per subtopic — enough for ~10 distinct tests without reuse
PROBLEMS_PER_SUBTOPIC = 50

# Max subtopics generating in parallel (each fires ~6 LLM calls)
SUBTOPIC_CONCURRENCY = 3

# Max concurrent LLM batches within a subtopic
BATCH_CONCURRENCY = 6

# Difficulty-level mapping for numeric difficulty_level
DIFFICULTY_LEVELS = {
    "easy": 3,
    "medium": 5,
    "hard": 8,
}


def _resolve_subtopics(content_map: dict, subject: str, count: int, force: bool) -> tuple[list[dict], int]:
    """
    Resolve all subtopics from the content map, looking up their DB IDs.
    Skips subtopics that already have enough full_sat problems unless force=True.
    """
    items = []
    skipped = 0

    for topic_name, meta in content_map.items():
        topic_slug = _make_slug(topic_name)
        topic_row = get_topic_by_slug(topic_slug)

        if topic_row is None:
            print(f"  !! topic '{topic_slug}' not in DB — skipping all subtopics")
            skipped += len(meta["subtopics"])
            continue

        for sub_name in meta["subtopics"]:
            subtopic_slug = _make_slug(sub_name)
            subtopic_row = get_subtopic(topic_row["id"], subtopic_slug)

            if subtopic_row is None:
                print(f"  !! subtopic '{subtopic_slug}' not in DB — skipping")
                skipped += 1
                continue

            subtopic_id = subtopic_row["id"]
            existing = get_full_sat_problem_count(subtopic_id)

            if existing >= count and not force:
                print(f"  >> {topic_name} / {sub_name} ({existing} already exist)")
                skipped += 1
                continue

            items.append({
                "topic_name": topic_name,
                "sub_name": sub_name,
                "subject": subject,
                "subtopic_id": subtopic_id,
                "topic_slug": topic_row["slug"],
                "subtopic_slug": subtopic_row["slug"],
                "existing": existing,
            })

    return items, skipped


async def _seed_subtopic(item: dict, count: int) -> int:
    """Generate and save full_sat problems for a single subtopic."""
    per_difficulty = count // 3
    remainders = count % 3
    buckets = {
        "easy": per_difficulty + (1 if remainders > 0 else 0),
        "medium": per_difficulty + (1 if remainders > 1 else 0),
        "hard": per_difficulty,
    }

    sem = asyncio.Semaphore(BATCH_CONCURRENCY)

    async def run_batch(difficulty: str, batch_num: int, batch_size: int, order_start: int) -> list[dict]:
        async with sem:
            return await generate_problems_batch(
                subtopic_name=item["sub_name"],
                topic_name=item["topic_name"],
                subtopic_id=item["subtopic_id"],
                batch_number=batch_num,
                difficulty=difficulty,
                batch_size=batch_size,
                start_order_index=order_start,
                subject=item["subject"],
            )

    tasks: list[asyncio.Task] = []
    global_offset = 0

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
            tasks.append(task)
        global_offset += bucket_count

    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_problems: list[dict] = []
    for result in results:
        if isinstance(result, Exception):
            print(f"    !! batch failed: {result}", flush=True)
        else:
            all_problems.extend(result)

    # Tag with full_sat metadata
    for p in all_problems:
        p["subtopic_id"] = item["subtopic_id"]
        p["topic_slug"] = item["topic_slug"]
        p["subtopic_slug"] = item["subtopic_slug"]
        p["difficulty_level"] = DIFFICULTY_LEVELS.get(p.get("difficulty", "medium"), 5)

    save_full_sat_problems(all_problems)
    return len(all_problems)


async def seed_full_sat_bank(
    subject: str = "math",
    count: int = PROBLEMS_PER_SUBTOPIC,
    force: bool = False,
    parallelism: int = SUBTOPIC_CONCURRENCY,
) -> dict:
    """Seed full_sat problems for all subtopics in the given subject."""
    content_map = MATH_CONTENT_MAP if subject == "math" else RW_CONTENT_MAP
    stats = {"seeded": 0, "skipped": 0, "failed": 0, "combinations": 0}

    print(f"  Resolving subtopics for {subject}...", flush=True)
    items, skipped = _resolve_subtopics(content_map, subject, count, force)
    stats["skipped"] = skipped
    stats["combinations"] = len(items) + skipped

    if not items:
        return stats

    sem = asyncio.Semaphore(parallelism)

    async def seed_one(item: dict) -> int:
        async with sem:
            id_short = item["subtopic_id"][:8]
            print(f"  > {item['topic_name']} / {item['sub_name']} [{id_short}...] — seeding {count}...", flush=True)
            t0 = time.time()
            n = await _seed_subtopic(item, count)
            elapsed = int(time.time() - t0)
            print(f"  + {item['sub_name']} — {n} problems in {elapsed}s", flush=True)
            return n

    task_list = [asyncio.create_task(seed_one(item)) for item in items]
    results = await asyncio.gather(*task_list, return_exceptions=True)

    for item, result in zip(items, results):
        if isinstance(result, Exception):
            print(f"  !! {item['sub_name']}: {result}")
            stats["failed"] += 1
        else:
            stats["seeded"] += result

    return stats
