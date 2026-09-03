"""
Problem Generator Agent — produces SAT problems with full solutions.
Generates in small batches (5) with retry and JSON repair for robustness.
"""

import asyncio
import json
import re
from typing import AsyncGenerator, Optional

from agno.agent import Agent

from app.utils.llm_client import claude
from app.pre_generation.option_validation import validate_problem_options

BATCH_SIZE = 10  # 10 per batch — large enough to be fast, small enough to avoid truncation
MAX_RETRIES = 3

SUBJECT_LABELS = {
    "math": "SAT Math",
    "reading-writing": "SAT Reading & Writing",
    "science": "Science",
    "social-studies": "Social Studies",
}

# Subjects framed around the SAT exam. Everything else is a general academic
# subject and uses the non-SAT instruction set below.
SAT_SUBJECTS = {"math", "reading-writing"}

_PROBLEM_INSTRUCTIONS = [
        "You are an expert SAT problem writer.",
        "Given a subtopic, its context, and the subject area, generate a batch of SAT-style multiple choice problems.",
        "Each problem must have EXACTLY 4 answer choices (A-D).",
        "Return ONLY a valid JSON array of problem objects with these exact keys:",
        "- difficulty: string ('easy' | 'medium' | 'hard')",
        "- questionText: string (the problem text — for Math use LaTeX with $...$ notation, for Reading & Writing include a short passage or sentence in the question; always escape currency dollar signs as \\$ e.g. write \\$5 not $5)",
        "- questionPhonetic: string (TTS-ready phonetic English version of questionText — strip ALL LaTeX/$...$ and spell out math: numbers stay as digits, variables stay as letters but render 'y' as 'wye'; '+' as 'plus'; '-' as 'minus' or 'negative'; '*' '\\cdot' '\\times' as 'times'; '/' or '\\div' as 'divided by'; '=' as 'equals'; '<'/'>' as 'is less than'/'is greater than'; '\\leq'/'\\geq' as 'is less than or equal to'/'is greater than or equal to'; 'x^2' as 'x squared'; 'x^3' as 'x cubed'; 'x^n' as 'x to the n power'; '\\frac{a}{b}' as 'a over b' (prefer 'one half', 'one third', 'one fourth' for 1/2, 1/3, 1/4); '\\sqrt{x}' as 'the square root of x'; '|x|' as 'the absolute value of x'; verbalize parens only when grouping changes meaning; for Reading & Writing this is the passage/question read naturally as English. Do NOT solve the problem, do NOT add or remove information.)",
        "- options: string[] (exactly 4 answer choices — for Math use LaTeX if needed, for Reading & Writing use plain text; always escape currency dollar signs as \\$ e.g. write \\$5 not $5). ALL FOUR OPTIONS MUST BE DISTINCT — never include the same answer twice, even with different formatting. Distractors must be plausible but mathematically/semantically different from each other AND from the correct option. Run a final pass before responding: if any two options share the same numeric value, same equation, or same answer text (ignoring whitespace), regenerate that distractor so all four are unique.",
        "- correctOption: number (0-3, index of the correct answer)",
        "- explanation: string (full worked explanation, keep concise)",
        "- solutionSteps: { step: number, instruction: string, math: string }[] (2-4 steps max — for Reading & Writing the 'math' field contains the relevant text/rule instead of equations)",
        "- conceptTags: string[] (fine-grained tags like 'slope-intercept', 'elimination-method' for Math or 'subject-verb-agreement', 'comma-splice' for Reading & Writing)",
        "- commonErrors: { error: string, why: string }[] (1-2 typical student mistakes)",
        "- timeRecommendationSeconds: number (target solve time)",
        "- satFrequency: string ('high' | 'medium' | 'low')",
        "- hint: string (a nudge without giving away the answer — names the method, points to what is given)",
        "- detailedHint: string (walks through the reasoning step by step, leaving only the final computation for the student — gets close but does NOT give away the answer)",
        "Keep explanations and steps CONCISE to stay within output limits.",
        "Problems should be realistic SAT-style questions with varying difficulty.",
        "Ensure all answers are correct and unambiguous.",
        "Never use em-dashes (—) in any text fields.",
        "Emojis are allowed but use them sparingly; do not overuse them.",
        "Return ONLY the JSON array, no markdown code fences or extra text.",
]

# General academic instruction set (Science, Social Studies, …). Same JSON
# schema as the SAT writer so downstream parsing/DB code is unchanged; the
# SAT-named `satFrequency` field is repurposed as concept centrality and all
# SAT references are dropped.
_GENERAL_PROBLEM_INSTRUCTIONS = [
        "You are an expert educator writing classroom-style multiple choice questions for a general academic subject.",
        "Given a subtopic, its context, and the subject area, generate a batch of clear multiple choice problems.",
        "Each problem must have EXACTLY 4 answer choices (A-D).",
        "Return ONLY a valid JSON array of problem objects with these exact keys:",
        "- difficulty: string ('easy' | 'medium' | 'hard')",
        "- questionText: string (the problem text — for Science use LaTeX with $...$ for any formulas or equations; for Social Studies use plain prose; always escape currency dollar signs as \\$ e.g. write \\$5 not $5)",
        "- questionPhonetic: string (TTS-ready phonetic English version of questionText — strip ALL LaTeX/$...$ and spell out any math: numbers stay as digits; '+' as 'plus'; '-' as 'minus'; '\\times' as 'times'; '=' as 'equals'; 'x^2' as 'x squared'; '\\frac{a}{b}' as 'a over b'; '\\sqrt{x}' as 'the square root of x'. For prose subjects this is simply the question read naturally as English. Do NOT solve the problem, do NOT add or remove information.)",
        "- options: string[] (exactly 4 answer choices — plain text, or LaTeX for Science formulas; always escape currency dollar signs as \\$). ALL FOUR OPTIONS MUST BE DISTINCT — never include the same answer twice, even with different formatting. Distractors must be plausible but clearly different from each other AND from the correct option. Run a final pass before responding: if any two options share the same value or answer text (ignoring whitespace), regenerate that distractor so all four are unique.",
        "- correctOption: number (0-3, index of the correct answer)",
        "- explanation: string (full worked explanation, keep concise)",
        "- solutionSteps: { step: number, instruction: string, math: string }[] (2-4 steps max — for prose subjects the 'math' field contains the relevant fact, quote, or reasoning instead of an equation)",
        "- conceptTags: string[] (fine-grained tags like 'photosynthesis', 'newtons-second-law' for Science or 'checks-and-balances', 'supply-and-demand' for Social Studies)",
        "- commonErrors: { error: string, why: string }[] (1-2 typical student mistakes)",
        "- timeRecommendationSeconds: number (target solve time)",
        "- satFrequency: string ('high' | 'medium' | 'low') — how central this concept is to the subject",
        "- hint: string (a nudge without giving away the answer — names the idea, points to what is given)",
        "- detailedHint: string (walks through the reasoning step by step, leaving only the final conclusion for the student — gets close but does NOT give away the answer)",
        "Keep explanations and steps CONCISE to stay within output limits.",
        "Problems should be accurate and grade-appropriate for a motivated high-school student.",
        "Ensure all answers are correct and unambiguous.",
        "Do NOT mention the SAT or any standardized test.",
        "Never use em-dashes (—) in any text fields.",
        "Emojis are allowed but use them sparingly; do not overuse them.",
        "Return ONLY the JSON array, no markdown code fences or extra text.",
]


def build_problem_agent(
    *,
    metadata: dict | None = None,
    feature: str = "pregen-problems",
    general: bool = False,
) -> Agent:
    """Construct a problem-generator agent.

    Pass `metadata` (an X-Majordomo-* header dict) to tag the call in the
    gateway dashboard with User-Id / Topic / Subtopic — live streaming calls
    do this so they're separable from bulk seeding. The module-level
    `problem_agent` singleton below is the untagged default used by the
    seeder and the legacy one-shot endpoint.

    Pass `general=True` for general academic subjects (Science, Social
    Studies, …) to use the non-SAT instruction set / persona.
    """
    return Agent(
        name="Academic Problem Generator" if general else "SAT Problem Generator",
        model=claude(id="claude-sonnet-4-6", feature=feature, metadata=metadata),
        description=(
            "You generate clear academic problems with full solutions."
            if general
            else "You generate realistic SAT problems with full solutions."
        ),
        instructions=_GENERAL_PROBLEM_INSTRUCTIONS if general else _PROBLEM_INSTRUCTIONS,
        markdown=False,
    )


problem_agent = build_problem_agent()

_general_problem_agent: Agent | None = None


def _get_general_problem_agent() -> Agent:
    """Lazily build the untagged general-academic problem agent used by the
    seeder for non-SAT subjects."""
    global _general_problem_agent
    if _general_problem_agent is None:
        _general_problem_agent = build_problem_agent(general=True)
    return _general_problem_agent


def _extract_json_array(text: str) -> list[dict]:
    """Extract and parse a JSON array from LLM output, handling common issues."""
    content = text.strip()

    # Strip markdown code fences
    if content.startswith("```"):
        content = content.split("\n", 1)[1]
        content = content.rsplit("```", 1)[0].strip()

    # Try direct parse first
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # Try to find the array boundaries
    start = content.find("[")
    if start == -1:
        raise ValueError("No JSON array found in response")

    # Try parsing from the array start
    try:
        return json.loads(content[start:])
    except json.JSONDecodeError:
        pass

    # Truncated output: try to salvage complete objects
    # Find the last complete object (ending with })
    last_brace = content.rfind("}")
    if last_brace == -1:
        raise ValueError("No complete JSON objects found")

    # Take everything up to the last } and close the array
    truncated = content[start : last_brace + 1]
    # Remove any trailing comma before we close
    truncated = truncated.rstrip().rstrip(",")
    if not truncated.endswith("]"):
        truncated += "]"

    try:
        return json.loads(truncated)
    except json.JSONDecodeError:
        pass

    # Last resort: extract individual objects with regex
    objects = []
    for match in re.finditer(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', content):
        try:
            obj = json.loads(match.group())
            if "questionText" in obj:
                objects.append(obj)
        except json.JSONDecodeError:
            continue

    if objects:
        return objects

    raise ValueError(f"Could not parse JSON from LLM output (length={len(content)})")


PROBLEM_TYPE_ROTATIONS = [
    "word problems set in real-world contexts (finance, science, everyday situations)",
    "pure algebraic / symbolic manipulation problems",
    "problems involving tables, graphs, or data interpretation",
    "multi-step problems that chain two or more concepts together",
    "problems where a common student error leads to a tempting wrong answer",
]


async def generate_problems_batch(
    subtopic_name: str,
    topic_name: str,
    subtopic_id: str,
    batch_number: int,
    difficulty: str = "medium",
    batch_size: int = BATCH_SIZE,
    start_order_index: int = 0,
    subject: str = "math",
    avoid_stems: Optional[list[str]] = None,
    agent: Optional[Agent] = None,
) -> list[dict]:
    """Generate a batch of SAT problems via LLM with retry logic.

    All problems in a batch share the same difficulty level so that callers
    can independently parallelize easy/medium/hard generation. Pass `agent`
    to use a per-request (metadata-tagged) agent; defaults to the shared
    `problem_agent` singleton.
    """
    run_agent = agent or (
        problem_agent if subject in SAT_SUBJECTS else _get_general_problem_agent()
    )
    subject_label = SUBJECT_LABELS.get(subject, subject)

    problem_type = PROBLEM_TYPE_ROTATIONS[batch_number % len(PROBLEM_TYPE_ROTATIONS)]

    subject_note = ""
    if subject == "reading-writing":
        subject_note = (
            "\nFor Reading & Writing problems: include a short passage or sentence in the questionText. "
            "Options should be plain text (no LaTeX). Focus on grammar, rhetoric, or comprehension as appropriate.\n"
        )
    elif subject == "science":
        subject_note = (
            "\nFor Science problems: use real scientific scenarios, data, and reasoning. Use $...$ LaTeX for "
            "any formulas, units, or equations; otherwise plain text. Test conceptual understanding, not just recall.\n"
        )
    elif subject == "social-studies":
        subject_note = (
            "\nFor Social Studies problems: use plain text (no LaTeX). Draw on history, geography, civics, and "
            "economics with specific examples, sources, or scenarios. Favor analysis and reasoning over rote dates.\n"
        )

    # Diversity context: stems of problems the student has ALREADY seen this
    # session. We ask the model to deliberately target a different aspect so a
    # small practice set doesn't turn into five variations of one problem.
    avoid_note = ""
    if avoid_stems:
        capped = [s.strip()[:120] for s in avoid_stems if s and s.strip()][:12]
        if capped:
            joined = "\n".join(f"- {s}" for s in capped)
            avoid_note = (
                "\nThe student has ALREADY seen these problems/contexts:\n"
                f"{joined}\n"
                "Deliberately target a DIFFERENT aspect, skill, or context of the "
                "subtopic. Do NOT reuse these scenarios, numbers, or phrasings.\n"
            )

    prompt = (
        f"Subject: {subject_label}\n"
        f"Topic: {topic_name}\n"
        f"Subtopic: {subtopic_name}\n"
        f"Difficulty: {difficulty} (ALL {batch_size} problems must be {difficulty} difficulty)\n"
        f"Batch: {batch_number + 1}\n"
        f"Problem type focus: {problem_type}\n"
        f"Generate exactly {batch_size} {difficulty} {subject_label} problems.\n"
        f"{subject_note}"
        f"{avoid_note}"
        f"Make each problem unique and cover different aspects of {subtopic_name}.\n"
        "Do not repeat question structures or contexts from earlier batches."
    )

    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            response = await run_agent.arun(prompt)
            problems = _extract_json_array(response.content)

            # Validate we got at least 1 problem
            if not problems:
                raise ValueError("Empty problems array")

            # Validate each problem's answer set and DROP the bad ones. The
            # LLM occasionally emits a duplicate distractor, two options that
            # are the same value in different forms (0.5 vs 1/2, 2x+4 vs 4+2x),
            # or a bad answer index — any of which is the "broken problem" a
            # student would hit. Dropping (rather than raising on the first
            # bad one) keeps the good problems in a large seed batch; we only
            # retry the whole call when nothing survives. For batch_size=1
            # (streaming) an empty kept list is equivalent to the old
            # raise-then-retry behavior.
            kept = []
            for p in problems:
                ok, reason = validate_problem_options(
                    p.get("options"), p.get("correctOption")
                )
                if ok:
                    kept.append(p)
                else:
                    # Terse marker so seeding logs stay scannable; the reason
                    # is available here for deeper debugging if needed.
                    print("⊘", end="", flush=True)
            if not kept:
                raise ValueError(
                    f"all {len(problems)} generated problems failed option validation"
                )

            # Add DB fields
            result = []
            for i, p in enumerate(kept):
                result.append({
                    "subtopic_id": subtopic_id,
                    "order_index": start_order_index + i,
                    "difficulty": difficulty,
                    "question_text": p["questionText"],
                    # Optional; left NULL when missing so the backfill can sweep
                    # any older rows. Future seeded rows ship with this field
                    # already populated for clean TTS playback.
                    "question_phonetic": p.get("questionPhonetic") or None,
                    "options": p["options"],
                    "correct_option": p["correctOption"],
                    "explanation": p.get("explanation", ""),
                    "solution_steps": p.get("solutionSteps", []),
                    "concept_tags": p.get("conceptTags", []),
                    "common_errors": p.get("commonErrors", []),
                    "time_recommendation_seconds": p.get("timeRecommendationSeconds", 120),
                    "sat_frequency": p.get("satFrequency", "medium"),
                    "hint": p.get("hint", ""),
                    "detailed_hint": p.get("detailedHint", ""),
                })
            return result

        except Exception as e:
            last_error = e
            if attempt < MAX_RETRIES - 1:
                print(f"⚠", end="", flush=True)

    raise RuntimeError(
        f"Failed to generate problems after {MAX_RETRIES} attempts for "
        f"{subtopic_name} batch {batch_number}: {last_error}"
    )


# ── Streaming generation ──────────────────────────────────────────────────
#
# The seeding path (generate_problems_batch) produces N problems in one LLM
# call and is optimized for throughput. The live quiz/practice surfaces want
# the opposite: the FIRST problem as fast as possible, then a pool filling in
# behind it. So we fire `count` independent single-problem calls concurrently
# and surface each the instant its call returns (asyncio.as_completed).
#
# One LLM call → one problem is also the natural seam for adaptivity: the
# difficulty of each call can key off how the student has done so far
# (`prior_answers`). v1 implements a deliberately simple bias; the shape is
# the part that matters.

_DIFFICULTY_LADDER = ("easy", "medium", "hard")


def _difficulty_plan(count: int, prior_answers: Optional[list[dict]]) -> list[str]:
    """Choose a per-problem difficulty sequence for a streamed pool.

    No history → cycle easy/medium/hard so the pool spans the range. With
    history → bias by recent accuracy: ≥80% correct skews harder, ≤40%
    skews easier. This is the adaptive seam, kept intentionally small.
    """
    if prior_answers:
        correct = sum(1 for a in prior_answers if a.get("isCorrect"))
        ratio = correct / len(prior_answers)
        if ratio >= 0.8:
            cycle = ("medium", "hard", "hard")
        elif ratio <= 0.4:
            cycle = ("easy", "easy", "medium")
        else:
            cycle = _DIFFICULTY_LADDER
    else:
        cycle = _DIFFICULTY_LADDER
    return [cycle[i % len(cycle)] for i in range(max(count, 0))]


def _to_client_problem(p: dict, order_index: int) -> dict:
    """Map a DB-shaped problem (from generate_problems_batch) to the camelCase
    shape the quiz UI's `Problem` type expects.

    `id` is stamped server-side for convenience, but the client restamps it
    to stay unique across refill batches — see use-streaming-problems.ts.
    """
    return {
        "id": f"gen-{order_index}",
        "orderIndex": order_index,
        "difficulty": p.get("difficulty", "medium"),
        "questionText": p["question_text"],
        "questionPhonetic": p.get("question_phonetic") or None,
        "options": p["options"],
        "correctOption": p["correct_option"],
        "explanation": p.get("explanation", ""),
        "solutionSteps": p.get("solution_steps", []),
        "hint": p.get("hint", ""),
        "detailedHint": p.get("detailed_hint", ""),
        "timeRecommendationSeconds": p.get("time_recommendation_seconds", 90),
        # Carried for coverage-aware dedup; the TS route destructures only the
        # fields it needs, so this is backward-compatible.
        "conceptTags": p.get("concept_tags", []),
    }


def _normalize_stem(text: str) -> str:
    """Normalize a question stem for near-duplicate detection: drop LaTeX
    commands/delimiters, reduce punctuation to spaces, lowercase."""
    t = text.lower()
    t = re.sub(r"\\[a-z]+", " ", t)   # latex commands: \frac, \cdot, …
    t = re.sub(r"[${}\\]", " ", t)     # latex delimiters / braces
    t = re.sub(r"[^a-z0-9]+", " ", t)  # punctuation → space
    return re.sub(r"\s+", " ", t).strip()


def _stem_tokens(text: str) -> set[str]:
    return set(_normalize_stem(text).split())


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    union = len(a | b)
    return len(a & b) / union if union else 0.0


# Stems that share a concept tag are held to a stricter similarity bar than
# unrelated ones: two "slope" problems with somewhat similar framing are a
# near-duplicate in a small set, while two "slope" problems with genuinely
# different framing are healthy variety. Concept overlap alone never drops a
# problem — that would starve narrow subtopics the model tags uniformly.
_STEM_DUP_THRESHOLD = 0.6
_CONCEPT_STEM_DUP_THRESHOLD = 0.4


async def generate_problems_streaming(
    *,
    subtopic_name: str,
    topic_name: str,
    subject: str = "math",
    count: int = 6,
    prior_answers: Optional[list[dict]] = None,
    avoid_stems: Optional[list[str]] = None,
    start_order_index: int = 0,
    batch_offset: int = 0,
    agent: Optional[Agent] = None,
) -> AsyncGenerator[dict, None]:
    """Yield `count` SAT problems as independent concurrent LLM calls, each
    surfaced the instant its call returns.

    Yields client-shaped dicts in COMPLETION order (fastest-first), not
    difficulty order — surfacing the first problem quickly is the point.
    `start_order_index` and `batch_offset` let a refill wave continue the
    order index and rotate the prompt's problem-type focus so successive
    waves don't repeat structures.
    """
    difficulties = _difficulty_plan(count, prior_answers)

    async def _one(i: int) -> list[dict]:
        return await generate_problems_batch(
            subtopic_name=subtopic_name,
            topic_name=topic_name,
            subtopic_id="stream",
            batch_number=batch_offset + i,
            difficulty=difficulties[i],
            batch_size=1,
            start_order_index=0,
            subject=subject,
            avoid_stems=avoid_stems,
            agent=agent,
        )

    tasks = [asyncio.create_task(_one(i)) for i in range(count)]
    order = start_order_index
    # (stem tokens, concept tags) of everything already yielded this wave.
    prior_entries: list[tuple[set[str], frozenset[str]]] = []
    try:
        for fut in asyncio.as_completed(tasks):
            try:
                problems = await fut
            except Exception:
                # A single failed problem shouldn't abort the whole pool —
                # the others are still in flight. Skip and keep going.
                continue
            for p in problems:
                tokens = _stem_tokens(p.get("question_text", ""))
                tags = frozenset(
                    t.strip().lower()
                    for t in (p.get("concept_tags") or [])
                    if isinstance(t, str) and t.strip()
                )
                dup = False
                for prev_tokens, prev_tags in prior_entries:
                    jac = _jaccard(tokens, prev_tokens)
                    if jac >= _STEM_DUP_THRESHOLD:
                        dup = True  # near-identical stem regardless of concept
                        break
                    if (
                        tags
                        and prev_tags
                        and (tags & prev_tags)
                        and jac >= _CONCEPT_STEM_DUP_THRESHOLD
                    ):
                        dup = True  # same concept AND similar framing
                        break
                if dup:
                    continue
                prior_entries.append((tokens, tags))
                yield _to_client_problem(p, order)
                order += 1
    finally:
        # If the consumer disconnects mid-stream, don't leave orphaned calls.
        for t in tasks:
            if not t.done():
                t.cancel()
