"""
Topic Generator Agent — produces rich topic metadata for SAT content.
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

# Subjects framed around the SAT exam. Everything else is a general academic
# subject and uses the non-SAT instruction set / persona below.
SAT_SUBJECTS = {"math", "reading-writing"}

topic_agent = Agent(
    name="SAT Topic Generator",
    model=claude(id="claude-sonnet-4-20250514", feature="pregen-topic"),
    description="You generate comprehensive SAT topic metadata.",
    instructions=[
        "You are an expert SAT curriculum designer.",
        "Given a topic name, its subtopic list, order index, icon, color scheme, and subject area, "
        "generate rich metadata for the topic.",
        "Return ONLY valid JSON with these exact keys:",
        "- overview: string (2-3 sentences describing the topic and its SAT importance)",
        "- learningObjectives: string[] (4-6 bullet points of what students will learn)",
        "- satRelevance: { questionCount: number, percentageOfTest: number, description: string }",
        "- difficultyDistribution: { easy: number, medium: number, hard: number } (percentages summing to 100)",
        "- estimatedTotalMinutes: number (total study time for the topic)",
        "- prerequisites: string[] (prior knowledge needed)",
        "- keyConcepts: string[] (6-10 foundational concepts)",
        "- proTips: string[] (3-5 SAT-specific strategy tips)",
        "Be specific to the actual SAT exam. Use real SAT statistics where possible.",
        "Never use em-dashes (—) in any text fields.",
        "Emojis are allowed but use them sparingly; do not overuse them.",
        "Return ONLY the JSON object, no markdown code fences or extra text.",
    ],
    markdown=False,
)


# General academic instruction set (Science, Social Studies, …). Same JSON
# schema as the SAT agent so the DB columns and downstream code are unchanged;
# the SAT-named fields are repurposed (satRelevance -> general importance) and
# all SAT references are dropped.
_GENERAL_TOPIC_INSTRUCTIONS = [
    "You are an expert curriculum designer for general academic subjects.",
    "Given a topic name, its subtopic list, order index, icon, color scheme, and subject area, "
    "generate rich metadata for the topic.",
    "Return ONLY valid JSON with these exact keys:",
    "- overview: string (2-3 sentences describing the topic and why it matters in this subject)",
    "- learningObjectives: string[] (4-6 bullet points of what students will learn)",
    "- satRelevance: { questionCount: number, percentageOfTest: number, description: string } "
    "(this is a general academic subject, NOT an SAT topic: set questionCount to 0 and "
    "percentageOfTest to 0, and use description for a one-sentence note on the topic's real-world "
    "or academic importance)",
    "- difficultyDistribution: { easy: number, medium: number, hard: number } (percentages summing to 100)",
    "- estimatedTotalMinutes: number (total study time for the topic)",
    "- prerequisites: string[] (prior knowledge needed)",
    "- keyConcepts: string[] (6-10 foundational concepts)",
    "- proTips: string[] (3-5 study tips for mastering this topic)",
    "Be accurate and grade-appropriate for a motivated high-school student.",
    "Do NOT mention the SAT or any standardized test.",
    "Never use em-dashes (—) in any text fields.",
    "Emojis are allowed but use them sparingly; do not overuse them.",
    "Return ONLY the JSON object, no markdown code fences or extra text.",
]

_general_topic_agent: Agent | None = None


def _get_general_topic_agent() -> Agent:
    """Lazily build the general-academic topic agent (only when a non-SAT
    subject is generated), so the running service's import path is unchanged."""
    global _general_topic_agent
    if _general_topic_agent is None:
        _general_topic_agent = Agent(
            name="Academic Topic Generator",
            model=claude(id="claude-sonnet-4-20250514", feature="pregen-topic"),
            description="You generate comprehensive academic topic metadata.",
            instructions=_GENERAL_TOPIC_INSTRUCTIONS,
            markdown=False,
        )
    return _general_topic_agent


async def generate_topic(
    name: str,
    subtopics: list[str],
    order: int,
    icon: str,
    color: str,
    subject: str = "math",
) -> dict:
    """Generate rich topic metadata via LLM."""
    subject_label = SUBJECT_LABELS.get(subject, subject)
    run_agent = topic_agent if subject in SAT_SUBJECTS else _get_general_topic_agent()
    prompt = (
        f"Subject: {subject_label}\n"
        f"Topic: {name}\n"
        f"Subtopics: {', '.join(subtopics)}\n"
        f"Order: {order}\n"
        f"Icon: {icon}\n"
        f"Color scheme: {color}\n\n"
        "Generate the complete topic metadata JSON."
    )
    response = await run_agent.arun(prompt)
    data = json.loads(response.content)

    # Merge with fixed fields
    slug = name.lower().replace(" ", "-").replace("(", "").replace(")", "")
    return {
        "slug": slug,
        "name": name,
        "subject": subject,
        "icon": icon,
        "order_index": order,
        "color_scheme": color,
        "overview": data["overview"],
        "learning_objectives": data["learningObjectives"],
        "sat_relevance": data["satRelevance"],
        "difficulty_distribution": data["difficultyDistribution"],
        "estimated_total_minutes": data["estimatedTotalMinutes"],
        "prerequisites": data["prerequisites"],
        "key_concepts": data["keyConcepts"],
        "pro_tips": data["proTips"],
    }
