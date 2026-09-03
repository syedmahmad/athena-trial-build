"""
Full SAT Test Assembler — selects problems from the pre-generated full_sat
bank and assembles them into a 98-question test blueprint.

Digital SAT structure:
  - Reading & Writing Module 1: 27 questions (32 min)
  - Reading & Writing Module 2: 27 questions (32 min)
  - Math Module 1: 22 questions (35 min)
  - Math Module 2: 22 questions (35 min)
  Total: 98 questions, 134 minutes

Usage:
    cd agents && python -m cli.main assemble-full-sat-test
    cd agents && python -m cli.main assemble-full-sat-test --test-number 2
"""

import random

from app.pre_generation.content_workflow import MATH_CONTENT_MAP, RW_CONTENT_MAP, _make_slug
from app.utils.db import (
    get_topic_by_slug,
    get_subtopic,
    get_full_sat_tests,
    create_full_sat_test,
    add_test_problems,
    get_used_full_sat_problem_ids,
    get_full_sat_problems_for_subtopic,
)

# How many questions each subtopic contributes per test.
# These approximate the real Digital SAT distribution.

RW_DISTRIBUTION = {
    "Information and Ideas": {
        "Central Ideas and Details": 4,
        "Inferences": 4,
        "Command of Evidence": 3,
        "Informational Graphics (tables, charts, graphs)": 3,
    },
    "Craft and Structure": {
        "Words in Context": 6,
        "Text Structure and Purpose": 5,
        "Cross-Text Connections": 3,
    },
    "Expression of Ideas": {
        "Rhetorical Synthesis": 5,
        "Transitions": 5,
    },
    "Standard English Conventions": {
        "Boundaries (run-ons, fragments, comma splices)": 4,
        "Form, Structure, and Sense (verb tense, parallelism, modifiers, pronouns)": 4,
        "Agreement (subject-verb, pronoun-antecedent)": 3,
        "Punctuation (commas, semicolons, colons, dashes, apostrophes)": 3,
    },
}
# Total R&W: 54 — verified

MATH_DISTRIBUTION = {
    "Algebra": {
        "Linear equations (one variable)": 3,
        "Linear equations (two variables)": 3,
        "Linear inequalities": 2,
        "Systems of linear equations": 3,
        "Linear functions": 3,
    },
    "Advanced Math": {
        "Equivalent expressions": 3,
        "Nonlinear equations (quadratic, exponential, radical, rational)": 3,
        "Polynomial operations": 2,
        "Nonlinear functions": 3,
        "Function transformations": 2,
    },
    "Problem Solving and Data Analysis": {
        "Ratios and proportional relationships": 1,
        "Percentages": 1,
        "Unit conversion": 1,
        "One-variable data (mean, median, standard deviation)": 1,
        "Two-variable data (scatterplots, regression)": 1,
        "Probability": 1,
        "Statistical inference (margin of error concepts)": 1,
    },
    "Geometry and Trigonometry": {
        "Area and volume": 1,
        "Lines, angles, and triangles": 1,
        "Similarity and congruence": 1,
        "Right triangle trigonometry": 1,
        "Circles (equations, arc length, sector area)": 1,
        "Coordinate geometry": 1,
    },
}
# Total Math: 44 — verified


def _resolve_subtopic_id(topic_name: str, subtopic_name: str) -> str | None:
    """Look up the subtopic ID from the DB."""
    topic_slug = _make_slug(topic_name)
    topic_row = get_topic_by_slug(topic_slug)
    if not topic_row:
        return None
    subtopic_slug = _make_slug(subtopic_name)
    subtopic_row = get_subtopic(topic_row["id"], subtopic_slug)
    return subtopic_row["id"] if subtopic_row else None


def _select_problems(
    subtopic_id: str,
    count: int,
    used_ids: set[str],
) -> list[dict]:
    """Select `count` random problems for a subtopic, excluding used IDs."""
    all_problems = get_full_sat_problems_for_subtopic(subtopic_id)
    available = [p for p in all_problems if p["id"] not in used_ids]

    if len(available) < count:
        print(f"    !! Only {len(available)} available (need {count}) for subtopic {subtopic_id[:8]}...")
        # Use what we have
        count = len(available)

    if count == 0:
        return []

    return random.sample(available, count)


def _split_into_modules(
    problems: list[dict],
    module1_size: int,
    module2_size: int,
) -> tuple[list[dict], list[dict]]:
    """
    Split problems into Module 1 (mixed difficulty) and Module 2 (harder).
    Module 1 gets easier problems, Module 2 gets harder ones.
    """
    # Sort by difficulty_level ascending
    sorted_problems = sorted(problems, key=lambda p: p.get("difficulty_level", 5))

    # Module 1 gets the easier half, Module 2 gets the harder half
    module1 = sorted_problems[:module1_size]
    module2 = sorted_problems[module1_size : module1_size + module2_size]

    # Shuffle within each module so problems aren't in strict order
    random.shuffle(module1)
    random.shuffle(module2)

    return module1, module2


def assemble_full_sat_test(test_number: int | None = None) -> dict:
    """
    Assemble a full SAT test from the problem bank.

    Returns the created test record with its ID.
    """
    # Determine test number
    existing_tests = get_full_sat_tests()
    if test_number is None:
        test_number = len(existing_tests) + 1

    name = f"Full SAT Practice Test {test_number}"
    print(f"\n  Assembling: {name}")

    used_ids = get_used_full_sat_problem_ids()
    print(f"  {len(used_ids)} problems already used in other tests")

    # Collect all problems by section
    rw_problems: list[dict] = []
    math_problems: list[dict] = []

    # ── Reading & Writing ──
    print("\n  Reading & Writing:")
    for topic_name, subtopics in RW_DISTRIBUTION.items():
        for subtopic_name, count in subtopics.items():
            subtopic_id = _resolve_subtopic_id(topic_name, subtopic_name)
            if not subtopic_id:
                print(f"    !! {subtopic_name}: subtopic not found in DB")
                continue

            selected = _select_problems(subtopic_id, count, used_ids)
            for p in selected:
                used_ids.add(p["id"])
            rw_problems.extend(selected)
            print(f"    + {subtopic_name}: {len(selected)}/{count}")

    # ── Math ──
    print("\n  Math:")
    for topic_name, subtopics in MATH_DISTRIBUTION.items():
        for subtopic_name, count in subtopics.items():
            subtopic_id = _resolve_subtopic_id(topic_name, subtopic_name)
            if not subtopic_id:
                print(f"    !! {subtopic_name}: subtopic not found in DB")
                continue

            selected = _select_problems(subtopic_id, count, used_ids)
            for p in selected:
                used_ids.add(p["id"])
            math_problems.extend(selected)
            print(f"    + {subtopic_name}: {len(selected)}/{count}")

    print(f"\n  Total selected: {len(rw_problems)} R&W + {len(math_problems)} Math = {len(rw_problems) + len(math_problems)}")

    # ── Split into modules ──
    rw_m1, rw_m2 = _split_into_modules(rw_problems, 27, 27)
    math_m1, math_m2 = _split_into_modules(math_problems, 22, 22)

    # ── Create the test ──
    test = create_full_sat_test(test_number, name)
    test_id = test["id"]
    print(f"  Created test: {test_id[:8]}...")

    # ── Build problem mappings ──
    mappings: list[dict] = []

    for i, p in enumerate(rw_m1):
        mappings.append({
            "problem_id": p["id"],
            "section": "reading_writing",
            "module": 1,
            "order_index": i,
        })

    for i, p in enumerate(rw_m2):
        mappings.append({
            "problem_id": p["id"],
            "section": "reading_writing",
            "module": 2,
            "order_index": i,
        })

    for i, p in enumerate(math_m1):
        mappings.append({
            "problem_id": p["id"],
            "section": "math",
            "module": 1,
            "order_index": i,
        })

    for i, p in enumerate(math_m2):
        mappings.append({
            "problem_id": p["id"],
            "section": "math",
            "module": 2,
            "order_index": i,
        })

    add_test_problems(test_id, mappings)
    print(f"  Assigned {len(mappings)} problems to test")

    return test
