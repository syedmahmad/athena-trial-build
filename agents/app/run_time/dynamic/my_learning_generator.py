"""
My Learning Generator — produces a topic overview + quiz questions
for any free-form topic the user requests.
"""

import json
import re
from agno.agent import Agent

from app.utils.llm_client import claude

MAX_RETRIES = 3

generator_agent = Agent(
    name="Athena My Learning Generator",
    model=claude(id="claude-sonnet-4-6", feature="my-learning-generator"),
    description="You create personalised learning content for any topic.",
    instructions=[
        "You are an expert educator. Given any topic, generate a complete learning package.",
        "Return ONLY valid JSON with this exact structure (no markdown fences, no extra text):",
        """{
  "description": "2-3 sentence overview of the topic",
  "learningObjectives": ["objective 1", "objective 2", "objective 3", "objective 4"],
  "tipsAndTricks": ["tip 1", "tip 2", "tip 3"],
  "commonMistakes": [
    {"mistake": "...", "correction": "...", "why": "..."},
    {"mistake": "...", "correction": "...", "why": "..."}
  ],
  "questions": [
    {
      "orderIndex": 0,
      "difficulty": "easy|medium|hard",
      "questionText": "...",
      "options": ["A", "B", "C", "D"],
      "correctOption": 0,
      "explanation": "...",
      "solutionSteps": [{"step": 1, "instruction": "...", "math": ""}],
      "hint": "...",
      "timeRecommendationSeconds": 60
    }
  ]
}""",
        "Generate exactly 10 questions covering different aspects and difficulties of the topic.",
        "Difficulty mix: 3 easy, 4 medium, 3 hard.",
        "Each question must have exactly 4 options.",
        "correctOption is 0-indexed (0=first option).",
        "solutionSteps: 2-3 steps. Use 'math' field for equations/formulas (empty string if not applicable).",
        "Keep explanations concise but complete.",
        "Make questions educational and unambiguous.",
        "Never use em-dashes (—) in any text fields.",
        "Emojis are allowed but use them sparingly; do not overuse them.",
        "Return ONLY the JSON object, nothing else.",
    ],
    markdown=False,
)


def _extract_json_object(text: str) -> dict:
    """Extract and parse a JSON object from LLM output."""
    content = text.strip()

    # Strip markdown code fences
    if content.startswith("```"):
        content = re.sub(r"^```[a-z]*\n?", "", content)
        content = re.sub(r"\n?```$", "", content.strip())

    # Try direct parse
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # Find the outermost JSON object
    start = content.find("{")
    if start == -1:
        raise ValueError("No JSON object found in response")

    # Find matching closing brace
    depth = 0
    for i, ch in enumerate(content[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(content[start : i + 1])
                except json.JSONDecodeError:
                    break

    raise ValueError(f"Could not parse JSON from LLM output (length={len(content)})")


async def generate_my_learning_content(topic: str) -> dict:
    """Generate a full learning package for any topic."""
    prompt = (
        f"Topic: {topic}\n\n"
        "Generate a complete learning package for this topic following the exact JSON structure "
        "in your instructions. Include a clear description, 4 learning objectives, 3 tips, "
        "2 common mistakes, and exactly 10 multiple-choice questions."
    )

    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            response = await generator_agent.arun(prompt)
            result = _extract_json_object(response.content)

            # Basic validation
            if "questions" not in result or len(result["questions"]) == 0:
                raise ValueError("No questions in response")

            # Normalise question field names (handle camelCase variants)
            questions = []
            for i, q in enumerate(result["questions"]):
                questions.append({
                    "orderIndex": q.get("orderIndex", i),
                    "difficulty": q.get("difficulty", "medium"),
                    "questionText": q.get("questionText", q.get("question_text", "")),
                    "options": q.get("options", []),
                    "correctOption": q.get("correctOption", q.get("correct_option", 0)),
                    "explanation": q.get("explanation", ""),
                    "solutionSteps": q.get("solutionSteps", q.get("solution_steps", [])),
                    "hint": q.get("hint", ""),
                    "timeRecommendationSeconds": q.get(
                        "timeRecommendationSeconds",
                        q.get("time_recommendation_seconds", 90),
                    ),
                })

            return {
                "description": result.get("description", ""),
                "learningObjectives": result.get("learningObjectives", result.get("learning_objectives", [])),
                "tipsAndTricks": result.get("tipsAndTricks", result.get("tips_and_tricks", [])),
                "commonMistakes": result.get("commonMistakes", result.get("common_mistakes", [])),
                "questions": questions,
            }

        except Exception as e:
            last_error = e
            if attempt < MAX_RETRIES - 1:
                print(f"⚠ Retry {attempt + 1} for topic '{topic}': {e}", flush=True)

    raise RuntimeError(
        f"Failed to generate content for '{topic}' after {MAX_RETRIES} attempts: {last_error}"
    )
