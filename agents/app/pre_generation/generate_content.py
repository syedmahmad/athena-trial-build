#!/usr/bin/env python3
"""
CLI runner for the SAT Content Generation Workflow.

Usage:
    cd agents && python generate_content.py              # generates math (default)
    cd agents && python generate_content.py math         # generates math
    cd agents && python generate_content.py reading-writing  # generates RW
    cd agents && python generate_content.py all          # generates math + RW
    cd agents && python generate_content.py science      # generates Science
    cd agents && python generate_content.py social-studies   # generates Social Studies
    cd agents && python generate_content.py all-new      # generates Science + Social Studies
"""

import asyncio
import sys
import time

from app.pre_generation.content_workflow import ContentGenerationWorkflow
from dotenv import load_dotenv

load_dotenv()


async def run_subject(workflow: ContentGenerationWorkflow, subject: str) -> dict:
    print(f"\n🎯 Generating content for: {subject}")
    start = time.time()

    stats = await workflow.run_generation(subject=subject)

    elapsed = time.time() - start
    minutes = int(elapsed // 60)
    seconds = int(elapsed % 60)

    print(f"\n  ✅ {subject} done in {minutes}m {seconds}s")
    print(f"     Topics: {stats['topics']}  Subtopics: {stats['subtopics']}  Problems: {stats['problems']}")
    return stats


async def main():
    print("╔══════════════════════════════════════════╗")
    print("║  Athena — SAT Content Generation         ║")
    print("╚══════════════════════════════════════════╝")

    subject = sys.argv[1] if len(sys.argv) > 1 else "math"
    if subject == "all":
        subjects = ["math", "reading-writing"]
    elif subject == "all-new":
        subjects = ["science", "social-studies"]
    else:
        subjects = [subject]

    workflow = ContentGenerationWorkflow()
    start = time.time()

    try:
        all_stats = []
        for s in subjects:
            stats = await run_subject(workflow, s)
            all_stats.append(stats)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    elapsed = time.time() - start
    minutes = int(elapsed // 60)
    seconds = int(elapsed % 60)

    totals = {k: sum(s[k] for s in all_stats) for k in all_stats[0]}

    print("\n╔══════════════════════════════════════════╗")
    print("║  Generation Complete!                    ║")
    print("╠══════════════════════════════════════════╣")
    print(f"║  Topics:     {totals['topics']:>5}                      ║")
    print(f"║  Subtopics:  {totals['subtopics']:>5}                      ║")
    print(f"║  Problems:   {totals['problems']:>5}                      ║")
    print(f"║  Time:       {minutes:>2}m {seconds:>2}s                      ║")
    print("╚══════════════════════════════════════════╝")


if __name__ == "__main__":
    asyncio.run(main())
