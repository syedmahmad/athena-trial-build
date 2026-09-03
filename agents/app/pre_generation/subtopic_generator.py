"""
Subtopic Generator Agent — produces rich subtopic metadata for SAT content.
"""

import json
from agno.agent import Agent

from app.utils.llm_client import claude

SUBJECT_LABELS = {
    "math": "SAT Math",
    "reading-writing": "SAT Reading & Writing",
    "science": "Science",
    "social-studies": "Social Studies",
}

# Subjects framed around the SAT exam. Everything else uses the general
# academic instruction set below.
SAT_SUBJECTS = {"math", "reading-writing"}

subtopic_agent = Agent(
    name="SAT Subtopic Generator",
    model=claude(id="claude-sonnet-4-20250514", feature="pregen-subtopic"),
    description="You generate comprehensive SAT subtopic metadata.",
    instructions=[
        "You are an expert SAT curriculum designer.",
        "Given a subtopic name, its parent topic context, and the subject area, generate rich metadata.",
        "Return ONLY valid JSON with these exact keys:",
        "- description: string (2-3 sentences describing the subtopic)",
        "- learningObjectives: string[] (3-5 specific learning objectives)",
        "- keyFormulas: { latex: string, description: string }[] (key formulas/rules — for Math use LaTeX notation, for Reading & Writing use grammar rules or strategies)",
        "- commonMistakes: { mistake: string, correction: string, why: string }[] (3-5 common student mistakes)",
        "- tipsAndTricks: string[] (3-5 specific strategies for this subtopic)",
        "- difficulty: string ('easy' | 'medium' | 'hard')",
        "- estimatedMinutes: number (study time for this subtopic)",
        "- prerequisiteSubtopicSlugs: string[] (slugs of prerequisite subtopics, can be empty)",
        "- conceptualOverview: { definition: string, realWorldExample: string, satContext: string, visualDescription: string }",
        "For Math: use LaTeX notation like \\frac{a}{b}, x^2, \\sqrt{x}, etc. in keyFormulas.",
        "For Reading & Writing: keyFormulas should contain key grammar rules, rhetorical strategies, or reading techniques (use plain text, not LaTeX).",
        "Be specific to the actual SAT exam content and format.",
        "Never use em-dashes (—) in any text fields.",
        "Emojis are allowed but use them sparingly; do not overuse them.",
        "Return ONLY the JSON object, no markdown code fences or extra text.",
    ],
    markdown=False,
)


# General academic instruction set (Science, Social Studies, …). Same JSON
# schema as the SAT agent; SAT-named fields are repurposed and SAT references
# dropped.
_GENERAL_SUBTOPIC_INSTRUCTIONS = [
    "You are an expert curriculum designer for general academic subjects.",
    "Given a subtopic name, its parent topic context, and the subject area, generate rich metadata.",
    "Return ONLY valid JSON with these exact keys:",
    "- description: string (2-3 sentences describing the subtopic)",
    "- learningObjectives: string[] (3-5 specific learning objectives)",
    "- keyFormulas: { latex: string, description: string }[] (key formulas, rules, or facts: for "
    "Science use LaTeX for equations like E = mc^2 or chemical relationships; for Social Studies "
    "put a key fact, date, definition, or principle in 'latex' as plain text)",
    "- commonMistakes: { mistake: string, correction: string, why: string }[] (3-5 common student mistakes)",
    "- tipsAndTricks: string[] (3-5 specific strategies for learning this subtopic)",
    "- difficulty: string ('easy' | 'medium' | 'hard')",
    "- estimatedMinutes: number (study time for this subtopic)",
    "- prerequisiteSubtopicSlugs: string[] (slugs of prerequisite subtopics, can be empty)",
    "- conceptualOverview: { definition: string, realWorldExample: string, satContext: string, visualDescription: string } "
    "(this is a general academic subject, NOT the SAT: use the 'satContext' field for how this concept "
    "shows up in the real world or further study, and do not mention any standardized test)",
    "Be accurate and grade-appropriate for a motivated high-school student.",
    "Do NOT mention the SAT or any standardized test.",
    "Never use em-dashes (—) in any text fields.",
    "Emojis are allowed but use them sparingly; do not overuse them.",
    "Return ONLY the JSON object, no markdown code fences or extra text.",
]

_general_subtopic_agent: Agent | None = None


def _get_general_subtopic_agent() -> Agent:
    """Lazily build the general-academic subtopic agent (non-SAT subjects only)."""
    global _general_subtopic_agent
    if _general_subtopic_agent is None:
        _general_subtopic_agent = Agent(
            name="Academic Subtopic Generator",
            model=claude(id="claude-sonnet-4-20250514", feature="pregen-subtopic"),
            description="You generate comprehensive academic subtopic metadata.",
            instructions=_GENERAL_SUBTOPIC_INSTRUCTIONS,
            markdown=False,
        )
    return _general_subtopic_agent


async def generate_subtopic(
    name: str,
    topic_name: str,
    topic_id: str,
    order_index: int,
    all_subtopic_names: list[str],
    subject: str = "math",
) -> dict:
    """Generate rich subtopic metadata via LLM."""
    subject_label = SUBJECT_LABELS.get(subject, subject)
    run_agent = subtopic_agent if subject in SAT_SUBJECTS else _get_general_subtopic_agent()
    prompt = (
        f"Subject: {subject_label}\n"
        f"Parent Topic: {topic_name}\n"
        f"Subtopic: {name}\n"
        f"Order Index (within topic): {order_index}\n"
        f"All subtopics in this topic: {', '.join(all_subtopic_names)}\n\n"
        "Generate the complete subtopic metadata JSON."
    )
    response = await run_agent.arun(prompt)
    data = json.loads(response.content)

    slug = name.lower().replace(" ", "-").replace("(", "").replace(")", "").replace(",", "")
    return {
        "topic_id": topic_id,
        "slug": slug,
        "name": name,
        "order_index": order_index,
        "description": data["description"],
        "learning_objectives": data["learningObjectives"],
        "key_formulas": data["keyFormulas"],
        "common_mistakes": data["commonMistakes"],
        "tips_and_tricks": data["tipsAndTricks"],
        "difficulty": data["difficulty"],
        "estimated_minutes": data["estimatedMinutes"],
        "prerequisite_subtopic_slugs": data["prerequisiteSubtopicSlugs"],
        "conceptual_overview": data["conceptualOverview"],
    }
