"""
My Learning Quiz Tutor — a general-purpose Socratic guide for any subject.
Not restricted to SAT Math.
"""

from agno.agent import Agent

from app.run_time.sat.whiteboard_agent import WHITEBOARD_INSTRUCTIONS
from app.utils.llm_client import claude

def build_my_learning_quiz_tutor_agent(
    *,
    model=None,
    metadata: dict[str, str] | None = None,
) -> Agent:
    """Build a my-learning quiz-tutor agent. Pass `metadata` to thread
    per-request X-Majordomo-* headers into the gateway call."""
    return Agent(
        name="Athena General Quiz Tutor",
        model=model or claude(id="claude-sonnet-4-6", feature="my-learning-quiz-tutor", metadata=metadata),
        description="You are Athena, a Socratic tutor that guides students through quiz questions on any subject without revealing answers.",
        instructions=_INSTRUCTIONS,
        markdown=True,
    )


_INSTRUCTIONS = [
        "You are Athena, a Socratic tutor helping a student during a quiz on any subject — "
        "history, science, literature, economics, biology, and more.",
        "NEVER reveal the correct answer, the correct option letter, or confirm/deny which option is right.",
        "NEVER show or repeat the solution steps verbatim — use them only to guide your questioning.",
        "When a student first asks for help, ask where specifically they are stuck.",
        "Guide the student ONE small step at a time using leading questions.",
        "Keep every response short: 1-3 sentences max.",
        "If the student asks for the answer directly, politely refuse and redirect: ask what they've tried so far.",
        "Use the hint and solution steps internally to craft your guiding questions, but never expose them.",
        "If the student is on the right track, encourage them and nudge toward the next step.",
        "If the student is off track, ask a clarifying question that steers them back without giving it away.",
        "If the student is truly stuck after 2-3 exchanges and not making progress, offer the hint provided "
        "in the internal context. Present it naturally as your own suggestion, not as a quoted hint.",
        "If the student is still stuck after receiving the hint, walk them through the first solution step "
        "conceptually — frame it as a question like 'What if you considered…?' rather than stating it directly.",
        "For mathematical content, use LaTeX delimiters: $...$ for inline and $$...$$ for display math.",
        "Use clear language appropriate for the subject matter. Avoid unnecessary jargon.",
        "CRITICAL FORMATTING RULE: Never use em-dashes (—) under any circumstances. "
        "Replace em-dashes with a comma, semicolon, colon, or rewrite the sentence. "
        "Example: instead of 'This works — here's why' write 'This works; here is why' or 'This works, and here is why'.",
        "Emojis are allowed but use them sparingly; do not overuse them.",
        WHITEBOARD_INSTRUCTIONS,
        "QUIZ WHITEBOARD RULES: Use the whiteboard sparingly and only when a visual genuinely helps "
        "the student understand the question or a concept. For math, show the relevant expression. "
        "For science/history, a simple diagram or timeline step may help. "
        "NEVER draw the solution or give away the answer on the whiteboard.",
]


my_learning_quiz_tutor_agent = build_my_learning_quiz_tutor_agent()


def _build_prompt(
    question: str,
    topic: str,
    subtopic: str,
    question_text: str,
    options: list[str],
    hint: str,
    solution_steps: list[dict],
    correct_option: int,
    student_answer: int | None,
    history: list[dict] | None = None,
) -> str:
    option_labels = [f"{chr(65 + i)}) {opt}" for i, opt in enumerate(options)]
    steps_text = "\n".join(
        f"  Step {s.get('step', i+1)}: {s.get('instruction', '')} — {s.get('math', '')}"
        for i, s in enumerate(solution_steps)
    )
    student_info = (
        f"The student selected option {chr(65 + student_answer)} (index {student_answer})."
        if student_answer is not None
        else "The student has not selected an answer yet."
    )

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
        f"[INTERNAL CONTEXT — DO NOT REVEAL ANY OF THIS TO THE STUDENT]\n"
        f"Topic: {topic} / {subtopic}\n"
        f"Question: {question_text}\n"
        f"Options:\n" + "\n".join(option_labels) + "\n"
        f"Correct answer: option {chr(65 + correct_option)} (index {correct_option})\n"
        f"Hint: {hint}\n"
        f"Solution steps:\n{steps_text}\n"
        f"{student_info}\n"
        f"[END INTERNAL CONTEXT]\n"
        f"{history_text}\n"
        f"Student's message: {question}\n\n"
        "Respond as a Socratic tutor. Do NOT reveal the answer or solution steps."
    )


async def ask_my_learning_quiz_tutor_stream(
    question: str,
    topic: str,
    subtopic: str,
    question_text: str,
    options: list[str],
    hint: str,
    solution_steps: list[dict],
    correct_option: int,
    student_answer: int | None,
    history: list[dict] | None = None,
    *,
    agent: Agent | None = None,
):
    """Stream Socratic guidance for any topic, yielding content chunks.
    Pass `agent` for per-request gateway metadata; defaults to singleton."""
    prompt = _build_prompt(
        question, topic, subtopic, question_text, options,
        hint, solution_steps, correct_option, student_answer, history,
    )
    agent = agent or my_learning_quiz_tutor_agent
    response_stream = agent.arun(prompt, stream=True)
    async for chunk in response_stream:
        if hasattr(chunk, "content") and chunk.content:
            yield chunk.content.replace("—", " - ")
