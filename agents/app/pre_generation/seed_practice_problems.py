#!/usr/bin/env python3
"""
CLI for seeding practice problems into the practice_problems table.

Usage:
    cd agents && python seed_practice_problems.py <topic> <subtopic> [options]

Examples:
    python seed_practice_problems.py "Algebra" "Linear Inequalities"
    python seed_practice_problems.py "Algebra" "Linear Inequalities" --count 60
    python seed_practice_problems.py "Grammar" "Subject-Verb Agreement" --subject reading-writing --count 50
    python seed_practice_problems.py "Algebra" "Linear Inequalities" --subtopic-id <uuid>
"""

import argparse
import asyncio
import sys
import time

from app.pre_generation.practice_problem_seeder import generate_practice_problems

from dotenv import load_dotenv

load_dotenv()


async def main():
    parser = argparse.ArgumentParser(description="Seed practice problems for a topic/subtopic")
    parser.add_argument("topic", help='Topic name (e.g. "Algebra")')
    parser.add_argument("subtopic", help='Subtopic name (e.g. "Linear Inequalities")')
    parser.add_argument("--subject", default="math", choices=["math", "reading-writing"],
                        help="Subject area (default: math)")
    parser.add_argument("--count", type=int, default=60,
                        help="Number of problems to generate, clamped to 50-100 (default: 60)")
    parser.add_argument("--subtopic-id", default=None,
                        help="Optional UUID of the subtopics table row")
    parser.add_argument("--start-order-index", type=int, default=0,
                        help="Starting order_index for generated problems (default: 0)")

    args = parser.parse_args()
    count = max(50, min(100, args.count))

    print("╔══════════════════════════════════════════╗")
    print("║  Athena — Practice Problem Seeder        ║")
    print("╚══════════════════════════════════════════╝")
    print(f"  Topic:    {args.topic}")
    print(f"  Subtopic: {args.subtopic}")
    print(f"  Subject:  {args.subject}")
    print(f"  Count:    {count}")
    if args.subtopic_id:
        print(f"  ID:       {args.subtopic_id}")
    print()

    start = time.time()
    try:
        problems = await generate_practice_problems(
            topic=args.topic,
            subtopic=args.subtopic,
            subject=args.subject,
            count=count,
            subtopic_id=args.subtopic_id,
            start_order_index=args.start_order_index,
        )
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    elapsed = time.time() - start
    minutes = int(elapsed // 60)
    seconds = int(elapsed % 60)

    print(f"\n✅ Seeded {len(problems)} problems in {minutes}m {seconds}s")


if __name__ == "__main__":
    asyncio.run(main())
