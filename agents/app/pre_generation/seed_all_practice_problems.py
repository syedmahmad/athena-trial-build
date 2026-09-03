#!/usr/bin/env python3
"""
CLI to seed practice problems for every topic/subtopic combination.
Skips any combination that already has enough problems in the practice_problems table.

Usage:
    cd agents && python seed_all_practice_problems.py
    cd agents && python seed_all_practice_problems.py --subject reading-writing
    cd agents && python seed_all_practice_problems.py --subject all
    cd agents && python seed_all_practice_problems.py --count 60 --force
"""

import argparse
import asyncio
import sys
import time

from app.pre_generation.content_workflow import MATH_CONTENT_MAP, RW_CONTENT_MAP, _make_slug
from app.utils.db import get_practice_problem_count, get_topic_by_slug, get_subtopic
from app.pre_generation.practice_problem_seeder import generate_practice_problems

from dotenv import load_dotenv

load_dotenv()

PROBLEMS_PER_SUBTOPIC = 60

# How many subtopics to generate in parallel.
# Each subtopic fires up to 6 concurrent LLM batches internally, so
# SUBTOPIC_CONCURRENCY=3 means at most ~18 simultaneous Claude calls.
SUBTOPIC_CONCURRENCY = 3


def _resolve_subtopics(content_map: dict, subject: str, count: int, force: bool):
    """
    Resolve all subtopic work items synchronously (DB lookups are fast/cheap).
    Returns a list of dicts describing each subtopic to seed, skipping ones
    that already have enough problems.
    """
    items = []
    skipped = 0
    for topic_name, meta in content_map.items():
        topic_slug = _make_slug(topic_name)
        topic_row = get_topic_by_slug(topic_slug)
        if topic_row is None:
            print(f"  ⚠️  topic '{topic_slug}' not found in DB — subtopic_id will be null")

        for sub_name in meta["subtopics"]:
            subtopic_slug = _make_slug(sub_name)
            subtopic_row: dict | None = None
            subtopic_id: str | None = None
            if topic_row is not None:
                subtopic_row = get_subtopic(topic_row["id"], subtopic_slug)
                if subtopic_row is not None:
                    subtopic_id = subtopic_row["id"]
                else:
                    print(f"  ⚠️  subtopic '{subtopic_slug}' not found in DB — subtopic_id will be null")

            existing = get_practice_problem_count(topic_slug, subtopic_slug)
            if existing >= count and not force:
                print(f"  ⏭  {topic_name} / {sub_name} ({existing} already exist)")
                skipped += 1
                continue

            items.append({
                "topic_name": topic_name,
                "sub_name": sub_name,
                "subject": subject,
                "subtopic_id": subtopic_id,
                "db_topic_slug": topic_row["slug"] if topic_row else None,
                "db_subtopic_slug": subtopic_row["slug"] if subtopic_row else None,
                "existing": existing,
            })

    return items, skipped


async def seed_subject(content_map: dict, subject: str, count: int, force: bool, parallelism: int = SUBTOPIC_CONCURRENCY) -> dict:
    stats = {"seeded": 0, "skipped": 0, "failed": 0, "combinations": 0}

    print("  Resolving subtopics from DB...", flush=True)
    items, skipped = _resolve_subtopics(content_map, subject, count, force)
    stats["skipped"] = skipped
    stats["combinations"] = len(items) + skipped

    if not items:
        return stats

    sem = asyncio.Semaphore(parallelism)

    async def seed_one(item: dict) -> int:
        async with sem:
            label = "regenerating" if item["existing"] > 0 else "seeding"
            id_note = f" [id={item['subtopic_id'][:8]}...]" if item["subtopic_id"] else " [no id]"
            print(f"  ▶ {item['topic_name']} / {item['sub_name']}{id_note} — {label} {count}...", flush=True)
            t0 = time.time()
            problems = await generate_practice_problems(
                topic=item["topic_name"],
                subtopic=item["sub_name"],
                subject=item["subject"],
                count=count,
                subtopic_id=item["subtopic_id"],
                topic_slug=item["db_topic_slug"],
                subtopic_slug=item["db_subtopic_slug"],
            )
            elapsed = int(time.time() - t0)
            print(f"  ✅ {item['sub_name']} — {len(problems)} problems in {elapsed}s", flush=True)
            return len(problems)

    tasks = [asyncio.create_task(seed_one(item)) for item in items]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for item, result in zip(items, results):
        if isinstance(result, Exception):
            print(f"  ❌ {item['sub_name']}: {result}")
            stats["failed"] += 1
        else:
            stats["seeded"] += result

    return stats


async def main():
    parser = argparse.ArgumentParser(
        description="Seed practice problems for all topic/subtopic combinations"
    )
    parser.add_argument(
        "--subject",
        default="math",
        choices=["math", "reading-writing", "all"],
        help="Subject area to seed (default: math)",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=PROBLEMS_PER_SUBTOPIC,
        help=f"Problems per subtopic, clamped to 50-100 (default: {PROBLEMS_PER_SUBTOPIC})",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-seed even if problems already exist",
    )
    parser.add_argument(
        "--parallelism",
        type=int,
        default=SUBTOPIC_CONCURRENCY,
        help=f"Number of subtopics to generate in parallel (default: {SUBTOPIC_CONCURRENCY})",
    )
    args = parser.parse_args()

    count = max(50, min(100, args.count))
    subjects = (
        [("math", MATH_CONTENT_MAP), ("reading-writing", RW_CONTENT_MAP)]
        if args.subject == "all"
        else [
            (
                args.subject,
                MATH_CONTENT_MAP if args.subject == "math" else RW_CONTENT_MAP,
            )
        ]
    )

    print("╔══════════════════════════════════════════╗")
    print("║  Athena — Seed All Practice Problems     ║")
    print("╚══════════════════════════════════════════╝")
    print(f"  Subject(s): {args.subject}")
    print(f"  Count/subtopic: {count}")
    print(f"  Parallelism:    {args.parallelism} subtopics")
    print(f"  Force re-seed: {args.force}")

    total_stats: dict = {"seeded": 0, "skipped": 0, "failed": 0, "combinations": 0}
    overall_start = time.time()

    for subject, content_map in subjects:
        print(f"\n══════════════════════════════════════")
        print(f"  {subject.upper()}")
        print(f"══════════════════════════════════════")
        stats = await seed_subject(content_map, subject, count, args.force, args.parallelism)
        for k in total_stats:
            total_stats[k] += stats[k]

    elapsed = time.time() - overall_start
    minutes = int(elapsed // 60)
    seconds = int(elapsed % 60)

    print("\n╔══════════════════════════════════════════╗")
    print("║  Done!                                   ║")
    print("╠══════════════════════════════════════════╣")
    print(f"║  Combinations: {total_stats['combinations']:>5}                      ║")
    print(f"║  Seeded:       {total_stats['seeded']:>5}                      ║")
    print(f"║  Skipped:      {total_stats['skipped']:>5}                      ║")
    print(f"║  Failed:       {total_stats['failed']:>5}                      ║")
    print(f"║  Time:         {minutes:>2}m {seconds:>2}s                      ║")
    print("╚══════════════════════════════════════════╝")

    if total_stats["failed"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
