"""
Quiz Skill — Generate pre-validated quiz questions with adaptive difficulty.

Critical design: answers are pre-validated via dual-solve verification before
being shown to the student. Checking is deterministic comparison, never AI.

Flow:
1. Generate question + full solution via Claude
2. Independently verify the answer (second Claude call, solves from scratch)
3. If both answers match -> verified
4. If mismatch -> regenerate or flag as unverified
5. Only verified questions presented to student
6. Student feedback is deterministic comparison
"""

from __future__ import annotations

import json
import re
from typing import AsyncGenerator

from app.utils.db import client
from app.utils.llm_client import anthropic_async_client
from app.pre_generation.option_validation import validate_problem_options
from app.studio.skills.registry import register_skill, SkillDefinition


def _parse_json_response(text: str) -> dict:
    """Parse JSON from Claude response, stripping markdown fences if present."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]  # remove opening fence
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]  # remove closing fence
        text = "\n".join(lines).strip()
    return json.loads(text)

# ── Register the quiz skill ──

register_skill(SkillDefinition(
    slug="quiz",
    name="Quiz",
    description="Generate and present validated quiz questions with adaptive difficulty",
    default_config={
        "questions_per_round": 3,
        "initial_difficulty": "medium",
        "adapt_difficulty": True,
        "hint_ladder": True,
        "allow_whiteboard_breakout": True,
    },
    prompt_template="",  # Quiz skill manages its own prompting
))

# ── Prompts ──

GENERATE_PROMPT = """Generate a multiple-choice quiz question about {topic}.
Difficulty: {difficulty}

Requirements:
1. Create a clear, specific question
2. Provide exactly 4 answer options (A, B, C, D)
3. Work through the COMPLETE solution step by step
4. Identify the correct answer
5. Write a clear explanation
6. Provide a hint (doesn't give away the answer, points to the method)
7. Provide a detailed hint (walks through most of the solution, stops before the final step)

Output as JSON:
{{
  "question_text": "...",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correct_option": 0,
  "explanation": "...",
  "solution_steps": [
    {{"step": "Step 1", "math": "...", "description": "..."}},
    ...
  ],
  "hint": "...",
  "detailed_hint": "..."
}}

ONLY output valid JSON. No markdown fences."""

VERIFY_PROMPT = """You are a math verification engine. Solve this problem and output ONLY a JSON object.

Question: {question_text}

Options:
{options_formatted}

Solve the problem from scratch. Determine which option is correct.

You MUST respond with ONLY this JSON object and nothing else — no explanation, no working, no markdown fences:
{{"correct_option": 0, "solution": "brief explanation"}}

Replace 0 with the correct 0-based option index. Replace the solution text with a one-sentence explanation. Output NOTHING else."""

WHITEBOARD_EXPLAIN_PROMPT = """You are a patient, visual math tutor. A student got a quiz question wrong and needs help understanding the concept.

Question: {question_text}

Options:
{options_formatted}

The correct answer is option {correct_option}: {correct_text}
The student chose option {student_option}: {student_text}

Explanation: {explanation}

Solution steps:
{solution_steps_formatted}

Create a whiteboard lesson that:
1. Starts by acknowledging what the student might have been thinking (why they picked their answer)
2. Identifies the key concept or step they missed
3. Walks through the correct solution visually, step by step
4. Ends with a clear takeaway

Use the <<<WHITEBOARD>>> format with JSON Lines whiteboard steps. Each step should have:
- action: "write", "draw", "highlight", or "clear"
- For "write": include "text" (the content to display), "position" (x,y coordinates), "style" (optional: "title", "body", "math", "emphasis")
- For "highlight": include "target" (what to highlight), "color" (highlight color)

Keep the explanation concise but thorough. Use math notation where appropriate (LaTeX wrapped in $...$).

Start with a brief text introduction, then switch to <<<WHITEBOARD>>> for the visual explanation."""


# ── Core functions ──

async def generate_verified_question(
    topic: str,
    difficulty: str = "medium",
    session_id: str | None = None,
    agent_id: str | None = None,
    max_retries: int = 2,
) -> dict:
    """Generate a quiz question with pre-validated answer.

    Uses dual-solve verification: generates the question with one call,
    then independently verifies by solving from scratch in a second call.
    """
    # Anthropic client via Majordomo gateway (see app/utils/llm_client.py).
    ai = anthropic_async_client(feature="studio-quiz")

    for attempt in range(max_retries + 1):
        # Step 1: Generate question + solution
        gen_response = await ai.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=1500,
            messages=[{
                "role": "user",
                "content": GENERATE_PROMPT.format(topic=topic, difficulty=difficulty),
            }],
        )

        try:
            question_data = _parse_json_response(gen_response.content[0].text)
        except json.JSONDecodeError:
            continue  # retry

        # Validate required fields
        required = ["question_text", "options", "correct_option", "explanation"]
        if not all(k in question_data for k in required):
            continue

        if len(question_data.get("options", [])) != 4:
            continue

        # Reject broken answer sets (duplicate / numerically-equal /
        # symbolically-equivalent options, or a bad answer index) before we
        # spend a verification call on them. Studio options carry an "A) "
        # style prefix; strip it so the validator sees the raw values.
        stripped_opts = [
            re.sub(r"^[A-Da-d]\)\s*", "", str(o)).strip()
            for o in question_data.get("options", [])
        ]
        opts_ok, _opts_reason = validate_problem_options(
            stripped_opts, question_data.get("correct_option")
        )
        if not opts_ok:
            continue  # retry generation

        # Step 2: Independent verification
        options_formatted = "\n".join(
            f"{i}) {opt}" for i, opt in enumerate(question_data["options"])
        )

        verify_response = await ai.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=500,
            messages=[{
                "role": "user",
                "content": VERIFY_PROMPT.format(
                    question_text=question_data["question_text"],
                    options_formatted=options_formatted,
                ),
            }],
        )

        try:
            verify_data = _parse_json_response(verify_response.content[0].text)
        except json.JSONDecodeError:
            continue  # retry

        # Step 3: Check if answers match
        generated_answer = question_data["correct_option"]
        verified_answer = verify_data["correct_option"]

        verified = generated_answer == verified_answer
        verification_method = "dual_solve"

        if not verified and attempt < max_retries:
            continue  # retry generation

        # Step 4: Store in DB
        row: dict = {
            "topic": topic,
            "difficulty": difficulty,
            "question_text": question_data["question_text"],
            "options": question_data["options"],
            "correct_option": generated_answer if verified else verified_answer,
            "explanation": question_data["explanation"],
            "solution_steps": question_data.get("solution_steps", []),
            "hint": question_data.get("hint", ""),
            "detailed_hint": question_data.get("detailed_hint", ""),
            "verified": verified,
            "verification_method": verification_method,
        }
        if session_id:
            row["session_id"] = session_id
        if agent_id:
            row["agent_id"] = agent_id

        resp = client().table("studio_quiz_questions").insert(row).execute()
        stored = resp.data[0] if resp.data else row

        return stored

    raise ValueError(f"Failed to generate verified question after {max_retries + 1} attempts")


async def generate_quiz_batch(
    topic: str,
    count: int = 3,
    difficulty: str = "medium",
    session_id: str | None = None,
    agent_id: str | None = None,
) -> list[dict]:
    """Generate a batch of verified quiz questions."""
    questions = []
    current_difficulty = difficulty

    for i in range(count):
        q = await generate_verified_question(
            topic=topic,
            difficulty=current_difficulty,
            session_id=session_id,
            agent_id=agent_id,
        )
        questions.append(q)

        # Adapt difficulty for subsequent questions if we have session context
        if session_id and i < count - 1:
            current_difficulty = adapt_difficulty(session_id)

    return questions


def check_answer(question_id: str, selected_option: int) -> dict:
    """Check a student's answer against the pre-validated correct answer.

    Returns deterministic result -- no AI involved in the checking.
    """
    resp = client().table("studio_quiz_questions").select("*").eq("id", question_id).execute()
    if not resp.data:
        raise ValueError(f"Question {question_id} not found")

    question = resp.data[0]
    is_correct = selected_option == question["correct_option"]
    attempts = (question.get("attempts") or 0) + 1

    # Update DB
    update: dict = {
        "student_answer": selected_option,
        "student_correct": is_correct,
        "attempts": attempts,
    }
    client().table("studio_quiz_questions").update(update).eq("id", question_id).execute()

    return {
        "correct": is_correct,
        "correct_option": question["correct_option"],
        "explanation": question["explanation"],
        "solution_steps": question["solution_steps"],
        "hint": question["hint"],
        "detailed_hint": question["detailed_hint"],
        "attempts": attempts,
        "verified": question["verified"],
    }


def adapt_difficulty(session_id: str) -> str:
    """Determine next question difficulty based on session performance."""
    resp = (
        client()
        .table("studio_quiz_questions")
        .select("difficulty, student_correct")
        .eq("session_id", session_id)
        .order("created_at", desc=True)
        .limit(5)
        .execute()
    )
    if not resp.data:
        return "medium"

    recent = resp.data
    correct_count = sum(1 for q in recent if q.get("student_correct"))
    total = len(recent)

    if total < 2:
        return "medium"

    ratio = correct_count / total
    if ratio >= 0.8:
        # Student doing well -- increase difficulty
        current = recent[0].get("difficulty", "medium")
        return {"easy": "medium", "medium": "hard", "hard": "hard"}[current]
    elif ratio <= 0.3:
        # Student struggling -- decrease difficulty
        current = recent[0].get("difficulty", "medium")
        return {"easy": "easy", "medium": "easy", "hard": "medium"}[current]

    return recent[0].get("difficulty", "medium")


async def stream_whiteboard_explanation(
    question_id: str,
    student_option: int | None = None,
) -> AsyncGenerator[str, None]:
    """Stream a whiteboard mini-lesson explaining a quiz question.

    Used when a student gets a question wrong and wants visual help.
    """
    resp = client().table("studio_quiz_questions").select("*").eq("id", question_id).execute()
    if not resp.data:
        raise ValueError(f"Question {question_id} not found")

    question = resp.data[0]
    options = question["options"]
    correct_idx = question["correct_option"]
    student_idx = student_option if student_option is not None else question.get("student_answer")

    options_formatted = "\n".join(f"{i}) {opt}" for i, opt in enumerate(options))
    steps_formatted = "\n".join(
        f"- {s.get('step', '')}: {s.get('description', '')} {s.get('math', '')}"
        for s in (question.get("solution_steps") or [])
    )

    prompt = WHITEBOARD_EXPLAIN_PROMPT.format(
        question_text=question["question_text"],
        options_formatted=options_formatted,
        correct_option=correct_idx,
        correct_text=options[correct_idx] if correct_idx < len(options) else "N/A",
        student_option=student_idx if student_idx is not None else "N/A",
        student_text=options[student_idx] if student_idx is not None and student_idx < len(options) else "N/A",
        explanation=question["explanation"],
        solution_steps_formatted=steps_formatted,
    )

    # Anthropic client via Majordomo gateway (see app/utils/llm_client.py).
    ai = anthropic_async_client(feature="studio-quiz")
    async with ai.messages.stream(
        model="claude-sonnet-4-5-20250929",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}],
    ) as response:
        async for text in response.text_stream:
            yield text
