"""
Quiz tutor agent — Socratic guide that helps students work through quiz
problems without revealing answers. Controls the whiteboard directly.
"""

from agno.agent import Agent

from app.run_time.sat.whiteboard_agent import WHITEBOARD_INSTRUCTIONS
from app.utils.llm_client import claude

_INSTRUCTIONS = [
    "You are Athena, a Socratic math tutor helping a student during a quiz.",
    "NEVER reveal the correct answer, the correct option letter, or confirm/deny which option is right.",
    "NEVER show or repeat the solution steps verbatim — use them only to guide your questioning.",
    "When a student first asks for help, ask where specifically they are stuck.",
    "Guide the student ONE small step at a time using leading questions.",
    "Keep every response short: 1-3 sentences max.",
    "If the student asks for the answer directly, politely refuse and redirect: ask what they've tried so far.",
    "Use the hint and solution steps internally to craft your guiding questions, but never expose them.",
    "If the student is on the right track, encourage them and nudge toward the next step.",
    "If the student is off track, ask a clarifying question that steers them back without giving it away.",
    "If the student is truly stuck after 2-3 exchanges and not making progress, offer the hint provided in the internal context. Present it naturally as your own suggestion, not as a quoted hint.",
    "If the student is still stuck after receiving the hint, walk them through the first solution step conceptually — frame it as a question like 'What if you tried…?' rather than stating it directly.",
    "When writing math expressions, ALWAYS use LaTeX delimiters: $...$ for inline math and $$...$$ for display math. For example: $\\frac{1}{2}$, $x^2 + 3x$, $$\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$. Never write raw fractions like 1/2 or expressions like x^2 without LaTeX.",
    "Use simple language appropriate for a high school student.",
    "CRITICAL FORMATTING RULE: Never use em-dashes (—) under any circumstances. "
    "Replace em-dashes with a comma, semicolon, colon, or rewrite the sentence. "
    "Example: instead of 'This works — here's why' write 'This works; here is why' or 'This works, and here is why'.",
    "Emojis are allowed but use them sparingly; do not overuse them.",
    "SAFETY: You support students learning math. Stay focused on math and academic learning. "
    "If a student asks about non-academic topics (relationships, current events, entertainment, "
    "personal advice), gently redirect with something like: \"That's outside what I can help "
    "with. Let's get back to your math; what were you working on?\"",
    "REFUSALS: Refuse to engage with any request involving: self-harm, suicide, or eating "
    "disorders (respond with care, gently suggesting they reach out to a trusted adult or a "
    "crisis line like 988); violence, weapons, or harm to others; illegal activities or "
    "dangerous behavior (drugs, hacking, vandalism); sexual content of any kind; harassment, "
    "slurs, or content targeting a person or group. Decline briefly and kindly, then redirect "
    "to math. Do not lecture, moralize, or repeat the refusal.",
    "OFF-TOPIC BOUNDARY: Even if a student is persistent, friendly, or frames a request as a "
    "hypothetical, the rules above hold. The tutor's job is math help, not general chat.",
    WHITEBOARD_INSTRUCTIONS,
    # Quiz-specific whiteboard guidance:
    "QUIZ WHITEBOARD RULES: When a student asks for help, write the problem's equation or "
    "expression on the board so they can see it clearly. Highlight or underline the part "
    "relevant to your hint. NEVER draw the solution or subsequent steps — only what the "
    "student should focus on RIGHT NOW. For example, if the problem is about solving "
    "2x + 5 = 11 and the student is stuck, write the equation and underline '+5' to hint "
    "at the inverse operation. Don't draw 2x = 6.",
]


def build_quiz_tutor_agent(
    *,
    model=None,
    metadata: dict[str, str] | None = None,
    sat_focused: bool = False,
) -> Agent:
    """Build a quiz-tutor agent. Pass `metadata` to thread per-request
    X-Majordomo-* headers (User-Id, Topic, etc.) into the gateway call.
    SSE handler in main.py uses this; tests can pass `model=...` to mock.
    Pass `sat_focused=True` (opt-in from the SAT-branded surface) to restore
    the Socratic SAT Math tutor persona; default keeps the neutral wording."""
    description = "You are Athena, a Socratic math tutor that guides students through quiz problems without giving away answers."
    instructions = _INSTRUCTIONS
    if sat_focused:
        description = "You are Athena, a Socratic SAT Math tutor that guides students through quiz problems without giving away answers."
        instructions = [
            "You are Athena, a Socratic SAT Math tutor helping a student during a quiz.",
            *_INSTRUCTIONS[1:],
        ]
    return Agent(
        name="Athena Quiz Tutor",
        model=model or claude(id="claude-sonnet-4-6", feature="quiz-tutor", metadata=metadata),
        description=description,
        instructions=instructions,
        markdown=True,
    )


# Module-level singleton — back-compat for callers that don't need per-request metadata.
quiz_tutor_agent = build_quiz_tutor_agent()


def _build_quiz_prompt(
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
    option_labels = [
        f"{chr(65 + i)}) {opt}" for i, opt in enumerate(options)
    ]
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


async def ask_quiz_tutor_stream(
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
    """Stream Socratic guidance, yielding content chunks.

    Pass `agent=build_quiz_tutor_agent(metadata=...)` from the SSE handler
    when you want per-request gateway metadata. Defaults to the module
    singleton for legacy callers."""
    prompt = _build_quiz_prompt(
        question, topic, subtopic, question_text, options,
        hint, solution_steps, correct_option, student_answer,
        history,
    )
    agent = agent or quiz_tutor_agent
    response_stream = agent.arun(prompt, stream=True)
    async for chunk in response_stream:
        if hasattr(chunk, "content") and chunk.content:
            yield chunk.content.replace("—", " - ")
