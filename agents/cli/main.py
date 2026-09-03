#!/usr/bin/env python3
"""
Athena CLI — admin/utility commands moved out of the HTTP surface.

Usage:
    python -m cli.main health
    python -m cli.main generate-lesson --question-text "..." --correct-answer "..." --category "..." --explanation "..."
    python -m cli.main seed-practice-problems --topic "..." --subtopic "..." [--subject math] [--count 60] [--subtopic-id ...] [--start-order-index 0]
    python -m cli.main generate-content
    python -m cli.main graft-pulse-checks [--topic algebra] [--subtopic <slug>] [--dry-run]
"""

import argparse
import asyncio
import sys
import time

from dotenv import load_dotenv

load_dotenv()


async def cmd_health(args):
    print('{"status": "ok", "service": "athena-agents"}')


async def cmd_generate_lesson(args):
    from app.pre_generation.lesson_generator import generate_lesson

    print("╔══════════════════════════════════════════╗")
    print("║  Athena — Lesson Generator               ║")
    print("╚══════════════════════════════════════════╝")
    print(f"  Category: {args.category}")
    print(f"  Question: {args.question_text[:60]}...")
    print()

    start = time.time()
    try:
        content = await generate_lesson(
            question_text=args.question_text,
            correct_answer=args.correct_answer,
            category=args.category,
            explanation=args.explanation,
        )
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    elapsed = time.time() - start
    print(f"✅ Generated in {elapsed:.1f}s\n")
    print(content)


async def cmd_seed_practice_problems(args):
    from app.pre_generation.practice_problem_seeder import generate_practice_problems

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


async def cmd_seed_full_sat_bank(args):
    from app.pre_generation.full_sat_seeder import seed_full_sat_bank
    from app.pre_generation.content_workflow import MATH_CONTENT_MAP, RW_CONTENT_MAP

    count = max(20, min(100, args.count))
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

    print("+" + "=" * 44 + "+")
    print("|  Athena — Full SAT Problem Bank Seeder      |")
    print("+" + "=" * 44 + "+")
    print(f"  Subject(s): {args.subject}")
    print(f"  Count/subtopic: {count}")
    print(f"  Force re-seed: {args.force}")

    total_stats = {"seeded": 0, "skipped": 0, "failed": 0, "combinations": 0}
    overall_start = time.time()

    for subject, _ in subjects:
        print(f"\n  === {subject.upper()} ===")
        stats = await seed_full_sat_bank(
            subject=subject,
            count=count,
            force=args.force,
        )
        for k in total_stats:
            total_stats[k] += stats[k]

    elapsed = time.time() - overall_start
    minutes = int(elapsed // 60)
    seconds = int(elapsed % 60)

    print(f"\n  Done in {minutes}m {seconds}s")
    print(f"  Seeded: {total_stats['seeded']} | Skipped: {total_stats['skipped']} | Failed: {total_stats['failed']}")

    if total_stats["failed"] > 0:
        sys.exit(1)


async def cmd_assemble_full_sat_test(args):
    from app.pre_generation.full_sat_test_assembler import assemble_full_sat_test

    print("+" + "=" * 44 + "+")
    print("|  Athena — Full SAT Test Assembler            |")
    print("+" + "=" * 44 + "+")

    start = time.time()
    try:
        test = assemble_full_sat_test(test_number=args.test_number)
    except Exception as e:
        print(f"\n  Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    elapsed = time.time() - start
    print(f"\n  Assembled test #{test['test_number']} ({test['name']}) in {elapsed:.1f}s")
    print(f"  Test ID: {test['id']}")


async def cmd_graft_pulse_checks(args):
    from app.pre_generation.pulse_check_grafter import graft_topic

    print("+" + "=" * 44 + "+")
    print("|  Athena — Pulse-Check Grafter                |")
    print("+" + "=" * 44 + "+")
    print(f"  Topic:    {args.topic}")
    if args.subtopic:
        print(f"  Subtopic: {args.subtopic}")
    print(f"  Dry run:  {args.dry_run}")
    print()

    start = time.time()
    try:
        success = await graft_topic(
            topic_slug=args.topic,
            subtopic_slug=args.subtopic,
            dry_run=args.dry_run,
            force=args.force,
        )
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    elapsed = time.time() - start
    minutes = int(elapsed // 60)
    seconds = int(elapsed % 60)
    print(f"\n✓ Done in {minutes}m {seconds}s — {success} subtopic(s) updated")


async def cmd_generate_content(args):
    from app.pre_generation.content_workflow import ContentGenerationWorkflow

    print("╔══════════════════════════════════════════╗")
    print("║  Athena — Content Generation Workflow    ║")
    print("╚══════════════════════════════════════════╝\n")

    start = time.time()
    try:
        workflow = ContentGenerationWorkflow()
        stats = await workflow.run_generation()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    elapsed = time.time() - start
    minutes = int(elapsed // 60)
    seconds = int(elapsed % 60)
    print(f"\n✅ Complete in {minutes}m {seconds}s")
    print(f"   Stats: {stats}")


def main():
    parser = argparse.ArgumentParser(prog="athena-cli", description="Athena admin utilities")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # health
    subparsers.add_parser("health", help="Check service status")

    # generate-lesson
    p_lesson = subparsers.add_parser("generate-lesson", help="Generate a lesson for a quiz question")
    p_lesson.add_argument("--question-text", required=True)
    p_lesson.add_argument("--correct-answer", required=True)
    p_lesson.add_argument("--category", required=True)
    p_lesson.add_argument("--explanation", required=True)

    # seed-practice-problems
    p_seed = subparsers.add_parser("seed-practice-problems", help="Seed practice problems into the DB")
    p_seed.add_argument("--topic", required=True)
    p_seed.add_argument("--subtopic", required=True)
    p_seed.add_argument("--subject", default="math", choices=["math", "reading-writing"])
    p_seed.add_argument("--count", type=int, default=60)
    p_seed.add_argument("--subtopic-id", default=None)
    p_seed.add_argument("--start-order-index", type=int, default=0)

    # generate-content
    subparsers.add_parser("generate-content", help="Run the full SAT content generation workflow")

    # seed-full-sat-bank
    p_fsat = subparsers.add_parser("seed-full-sat-bank", help="Seed the full SAT problem bank")
    p_fsat.add_argument("--subject", default="math", choices=["math", "reading-writing", "all"])
    p_fsat.add_argument("--count", type=int, default=50, help="Problems per subtopic (default: 50)")
    p_fsat.add_argument("--force", action="store_true", help="Re-seed even if problems exist")

    # assemble-full-sat-test
    p_assemble = subparsers.add_parser("assemble-full-sat-test", help="Assemble a full SAT test from the bank")
    p_assemble.add_argument("--test-number", type=int, default=None, help="Test number (auto-increments if omitted)")

    # graft-pulse-checks
    p_graft = subparsers.add_parser(
        "graft-pulse-checks",
        help="Backfill pulse_check steps into existing prod micro_lessons by re-running the agent and splicing.",
    )
    p_graft.add_argument("--topic", default="algebra", help="Topic slug (default: algebra)")
    p_graft.add_argument("--subtopic", default=None, help="Single subtopic slug; omit to run every subtopic of the topic")
    p_graft.add_argument("--dry-run", action="store_true", help="Print planned grafts without writing")
    p_graft.add_argument(
        "--force",
        action="store_true",
        help="Strip existing pulse_checks before re-grafting (otherwise subtopics with any pulse_check are skipped)",
    )

    args = parser.parse_args()

    dispatch = {
        "health": cmd_health,
        "generate-lesson": cmd_generate_lesson,
        "seed-practice-problems": cmd_seed_practice_problems,
        "generate-content": cmd_generate_content,
        "seed-full-sat-bank": cmd_seed_full_sat_bank,
        "assemble-full-sat-test": cmd_assemble_full_sat_test,
        "graft-pulse-checks": cmd_graft_pulse_checks,
    }

    asyncio.run(dispatch[args.command](args))


if __name__ == "__main__":
    main()
