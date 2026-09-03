"""
My Learning Lesson Agent — a general-purpose teacher for any topic.
Not restricted to SAT Math.
"""

from agno.agent import Agent

from app.run_time.sat.whiteboard_agent import WHITEBOARD_INSTRUCTIONS
from app.utils.llm_client import claude

def build_my_learning_lesson_agent(
    *,
    model=None,
    metadata: dict[str, str] | None = None,
) -> Agent:
    """Build a my-learning lesson agent. Pass `metadata` to thread
    per-request X-Majordomo-* headers into the gateway call."""
    return Agent(
        name="Athena General Tutor",
        model=model or claude(id="claude-sonnet-4-6", feature="my-learning-lesson", metadata=metadata),
        description="You are Athena, an expert tutor who teaches any subject with clarity and depth.",
        instructions=_LESSON_INSTRUCTIONS,
        markdown=True,
    )


_LESSON_INSTRUCTIONS = [
        "You are Athena, a knowledgeable tutor with expertise across all academic subjects — "
        "history, science, literature, mathematics, economics, and more. "
        "You teach with clarity, precision, and quiet confidence — like an expert tutor "
        "in a one-on-one session.",

        "CRITICAL FORMATTING RULE: Never use em-dashes (—) under any circumstances. "
        "Replace em-dashes with a comma, semicolon, colon, or rewrite the sentence. "
        "Example: instead of 'This works — here's why' write 'This works; here is why' or 'This works, and here is why'.",

        # Tone & voice
        "TONE: Professional, warm, and direct. Respect the student's intelligence. "
        "Speak the way a great professor or private tutor would — clear explanations, "
        "no filler, no cheerleading. Use emojis sparingly if at all; do not overuse them. Never use exclamation marks gratuitously. "
        "Avoid phrases like 'Great job!', 'You got this!', 'Super easy!', 'Let's dive in!'. "
        "Confidence is conveyed through the quality of the explanation, not through hype.",

        "Structure every lesson using these exact markdown headings (you MUST use ## for each):\n"
        "## Overview\n"
        "One short paragraph: what this is and why it matters.\n\n"
        "## Core Concepts\n"
        "3–4 bullet points covering the essential ideas. No padding.\n\n"
        "## Example\n"
        "One concrete example or case study, walked through briefly.\n\n"
        "## Common Misconceptions\n"
        "1–2 things people get wrong, explained in a sentence each.\n\n"
        "## Key Takeaway\n"
        "One sentence that captures the core mental model.\n\n"
        "CRITICAL: Every section title MUST start with `## `. Never write a section title as plain text.",

        "Be concise. Each section should be as short as it can be while still being complete. "
        "Cut any sentence that doesn't add understanding. Aim for the whole lesson to read in under 3 minutes.",

        "Use the whiteboard selectively — only for content that genuinely benefits from visualisation. "
        "For history: a timeline or cause-effect chain. For science: a process diagram. "
        "For math: equations and worked steps. Skip the whiteboard if plain text is clearer.",

        "When writing mathematical expressions, use LaTeX delimiters: $...$ for inline and $$...$$ for display math.",

        "Use markdown ## headings for section structure. Keep paragraphs to 2–3 sentences maximum.",

        WHITEBOARD_INSTRUCTIONS,

        "LESSON WHITEBOARD RULES: Use the whiteboard only when a visual adds clarity that prose cannot. "
        "One or two focused whiteboard sequences per lesson is enough. Do not whiteboard every point.",
]


my_learning_lesson_agent = build_my_learning_lesson_agent()


def build_my_learning_chat_agent(
    *,
    model=None,
    metadata: dict[str, str] | None = None,
) -> Agent:
    """Build a my-learning follow-up chat agent. Pass `metadata` to thread
    per-request X-Majordomo-* headers into the gateway call."""
    return Agent(
        name="Athena General Tutor Follow-up",
        model=model or claude(id="claude-sonnet-4-6", feature="my-learning-lesson-chat", metadata=metadata),
        description="You are Athena, an expert tutor answering follow-up questions on any subject.",
        instructions=_CHAT_INSTRUCTIONS,
        markdown=True,
    )


_CHAT_INSTRUCTIONS = [
        "You are Athena, a knowledgeable tutor answering follow-up questions after a lesson on any subject.",

        "CRITICAL FORMATTING RULE: Never use em-dashes (—) under any circumstances. "
        "Replace em-dashes with a comma, semicolon, colon, or rewrite the sentence.",

        "TONE: Professional, warm, and direct. Use emojis sparingly if at all; do not overuse them. Never use gratuitous exclamation marks. "
        "Avoid patronizing phrases. Answer with clarity and precision.",

        "The student just completed a lesson and has questions. Use the lesson context provided "
        "to give accurate, substantive answers. "
        "Keep responses focused and concise. If the student asks to re-explain something, "
        "approach it from a different angle than the original lesson.",

        "When writing mathematical expressions, use LaTeX delimiters: $...$ for inline and $$...$$ for display math.",

        WHITEBOARD_INSTRUCTIONS,

        "FOLLOW-UP WHITEBOARD RULES: Use the whiteboard when the student's question involves "
        "concepts that benefit from visual explanation. Don't repeat the entire lesson — "
        "focus on what the student asked.",
]


my_learning_chat_agent = build_my_learning_chat_agent()


def _build_lesson_prompt(topic: str, subtopic: str, metadata: dict) -> str:
    sections = [f"Topic: {topic}\nSubtopic: {subtopic}\n"]

    if metadata.get("description"):
        sections.append(f"Description: {metadata['description']}")

    if metadata.get("learning_objectives"):
        objectives = "\n".join(f"- {obj}" for obj in metadata["learning_objectives"])
        sections.append(f"Learning Objectives:\n{objectives}")

    if metadata.get("common_mistakes"):
        mistakes = "\n".join(
            f"- Mistake: {m.get('mistake', '')} | Correction: {m.get('correction', '')}"
            for m in metadata["common_mistakes"]
        )
        sections.append(f"Common Mistakes:\n{mistakes}")

    if metadata.get("tips_and_tricks"):
        tips = "\n".join(f"- {t}" for t in metadata["tips_and_tricks"])
        sections.append(f"Tips & Tricks:\n{tips}")

    return (
        "[LESSON CONTEXT]\n"
        + "\n\n".join(sections)
        + "\n[END LESSON CONTEXT]\n\n"
        "Create a concise micro-lesson using the 5-part structure with proper ## markdown headings. "
        "Be brief — readable in under 3 minutes. Use the whiteboard only where a visual genuinely helps."
    )


def _build_chat_prompt(
    question: str,
    topic: str,
    subtopic: str,
    lesson_summary: str,
    history: list[dict] | None = None,
) -> str:
    history_text = ""
    if history:
        lines = []
        for msg in history:
            role = "Student" if msg.get("role") == "user" else "Athena"
            lines.append(f"{role}: {msg.get('content', '')}")
        history_text = (
            "\n[CONVERSATION SO FAR]\n"
            + "\n".join(lines)
            + "\n[END CONVERSATION]\n"
        )

    return (
        f"[LESSON CONTEXT]\n"
        f"Topic: {topic}\nSubtopic: {subtopic}\n"
        f"Lesson summary: {lesson_summary}\n"
        f"[END LESSON CONTEXT]\n"
        f"{history_text}\n"
        f"Student's question: {question}"
    )


async def generate_my_learning_lesson_stream(
    topic: str,
    subtopic: str,
    metadata: dict,
    *,
    agent: Agent | None = None,
):
    """Pass `agent` for per-request gateway metadata; defaults to singleton."""
    prompt = _build_lesson_prompt(topic, subtopic, metadata)
    agent = agent or my_learning_lesson_agent
    response_stream = agent.arun(prompt, stream=True)
    async for chunk in response_stream:
        if hasattr(chunk, "content") and chunk.content:
            yield chunk.content.replace("—", " - ")


async def my_learning_lesson_chat_stream(
    question: str,
    topic: str,
    subtopic: str,
    lesson_summary: str,
    history: list[dict] | None = None,
    *,
    agent: Agent | None = None,
):
    """Pass `agent` for per-request gateway metadata; defaults to singleton."""
    prompt = _build_chat_prompt(question, topic, subtopic, lesson_summary, history)
    agent = agent or my_learning_chat_agent
    response_stream = agent.arun(prompt, stream=True)
    async for chunk in response_stream:
        if hasattr(chunk, "content") and chunk.content:
            yield chunk.content.replace("—", " - ")
