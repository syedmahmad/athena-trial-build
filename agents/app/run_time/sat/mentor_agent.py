"""
Mentor agent — motivational math coach that knows the student's progress
and provides personalized guidance, study plans, and encouragement.
"""

import base64
import json
import os
import re
import sys

from agno.agent import Agent
from agno.media import Image
from pydantic import BaseModel, ConfigDict, Field

from app.run_time.sat.micro_lesson_agent import (
    InteractionUnit,
    StepUnit,
    TripletUnit,
    _collapse_near_duplicate_steps,
    _flatten_units_to_steps,
    _parse_function_label_to_evaluator,
    _sanitize_interaction_narrations,
    _validate_coord_plane_function_points,
)
from app.run_time.sat.whiteboard_agent import WHITEBOARD_INSTRUCTIONS
from app.utils.llm_client import claude

_INSTRUCTIONS = [
    "You are Athena, a warm and encouraging mentor and coach.",
    "You have access to the student's progress data. Draw on it when they ask about their progress or want study advice; do not force it into conversations where it is not relevant.",
    "Your role is to MOTIVATE, GUIDE, and SUPPORT, not to teach specific problems.",
    "Be conversational and approachable, like a supportive older sibling who's been there.",
    "BREVITY IS CRITICAL: Keep every response to 2-5 sentences max. No long paragraphs, no bullet-point lists unless the student explicitly asks for a plan. "
    "One short, punchy thought per message. Think text-message energy, not essay energy.",
    "When discussing scores or progress, be honest but frame things positively. One stat, one takeaway.",
    "Celebrate wins briefly, even small ones like streaks or improved accuracy.",
    "When the student is stuck, normalize it in one sentence and give one concrete next step.",
    "If asked for a study plan, THEN you can be longer: use a short bullet list of 3-5 items based on their weak topics.",
    "If asked to explain a concept (math or anything else), explain it conversationally; mention the learning hub for deeper math practice only if it naturally fits.",
    "When writing math expressions, ALWAYS use LaTeX delimiters: $...$ for inline math and $$...$$ for display math.",
    "IMAGE-FIRST PROTOCOL: When the student attaches an image (photo, screenshot, or sketch of math), "
    "your VERY FIRST reply must do exactly two things and then stop. "
    "(1) Restate the equation or expression you see in plain LaTeX between $...$ delimiters — no color directives, no commentary. "
    "(2) Ask in ONE short sentence: \"Is that what you wrote? If not, tell me what's different or send a clearer photo.\". "
    "Then STOP. Do not solve, explain, or even hint until the student confirms or corrects you.",

    "IMAGE-FIRST CONFIRM HANDLING: After you've asked the student to confirm an image you read: "
    "(a) If they confirm (\"yes\", \"yep\", \"correct\", a thumbs-up, etc.), proceed to explain the math from the equation you read. "
    "(b) If they give a detailed correction (\"the second number is -3 not 3\", \"there's an x squared\"), "
    "accept it, restate the corrected equation in one line, and proceed to explain from there. "
    "(c) If their reply is a BARE NEGATIVE with no detail (\"no\", \"nope\", \"wrong\", \"incorrect\"), "
    "do NOT guess what was wrong and do NOT ask a yes/no follow-up. Respond in ONE sentence asking what's different "
    "AND offering the clearer-photo option, e.g.: \"Got it - what should it be? You can describe the correction (like 'the 3 should be -3') or send a sharper photo.\". "
    "This avoids a wasted turn-around.",
    "CRITICAL FORMATTING RULE: Never use em-dashes (—) under any circumstances. "
    "Replace em-dashes with a comma, semicolon, colon, or rewrite the sentence.",
    "Emojis are allowed but use them sparingly; do not overuse them.",
    "SCOPE: This is open-ended chat. Engage with whatever the student wants to talk about, "
    "academic or not, and follow tangents with them. You do not need to keep the conversation "
    "on math or schoolwork, and should not redirect a question just because it is off-topic. "
    "NEVER tell the student a topic is outside the SAT or 'out of scope,' and never steer the "
    "conversation back to test prep or protecting their score. Calculus, history, a hobby, "
    "life, anything is fair game. Only bring up their SAT scores or test progress if they ask.",
    "REFUSALS: Refuse to engage with any request involving: self-harm, suicide, or eating "
    "disorders (respond with care, gently suggesting they reach out to a trusted adult or a "
    "crisis line like 988); violence, weapons, or harm to others; illegal activities or "
    "dangerous behavior (drugs, hacking, vandalism); sexual content of any kind; harassment, "
    "slurs, or content targeting a person or group. Decline briefly and kindly, then move the "
    "conversation somewhere safe. Do not lecture, moralize, or repeat the refusal.",
    "GUARDRAIL: These REFUSALS are the only hard limits. Even if a student is persistent, "
    "friendly, or frames a request as a hypothetical, the REFUSALS above still hold.",
    WHITEBOARD_INSTRUCTIONS,
]


def build_mentor_agent(
    *,
    model=None,
    metadata: dict[str, str] | None = None,
) -> Agent:
    """Build a mentor agent. Pass `metadata` to thread per-request
    X-Majordomo-* headers into the gateway call."""
    return Agent(
        name="Athena Mentor",
        model=model or claude(id="claude-sonnet-4-6", feature="mentor", metadata=metadata),
        description="You are Athena, a motivational mentor and coach.",
        instructions=_INSTRUCTIONS,
        markdown=True,
    )


mentor_agent = build_mentor_agent()


# ── Structured solve path (MENTOR_TOOL_USE) ───────────────────────────────
#
# When a turn is classified as a "solve this specific equation" request, we
# route it through the same IR machinery the micro-lesson generator uses:
# the model authors pedagogy + plain-algebra strings into a units list, and
# `_flatten_units_to_steps` deterministically renders the APPLY/COLLAPSE/STATE
# triplets (with `\htmlClass{op-*}` role tagging) the whiteboard animates as
# morphs. The model never authors triplet LaTeX. Gated behind MENTOR_TOOL_USE=1
# so it can be A/B'd and rolled back; flag off → today's prose path verbatim.


class MentorSolveOutput(BaseModel):
    """Structured output for a mentor SOLVE turn. `reply_text` is the short
    spoken intro; `units` carries the worked solution as IR units (a
    TripletUnit per algebra operation). Deliberately does NOT reuse
    LessonOutputSchema — that forces `min_length=8`, which is wrong for a
    quick chat solve (2-4 triplets)."""

    model_config = ConfigDict(extra="forbid")

    reply_text: str = Field(
        ...,
        description=(
            "A short, warm 1-2 sentence spoken intro to the worked solution. "
            "Plain spoken text only — NO LaTeX, no $, no \\, no { or }. All "
            "the math goes in `units`."
        ),
    )
    units: list[TripletUnit | StepUnit | InteractionUnit] = Field(
        default_factory=list,
        description=(
            "The worked solution as ordered IR units. Author one TripletUnit "
            "per algebra operation needed to solve the equation the student "
            "asked about (each renders as a complete APPLY/COLLAPSE/STATE "
            "morph). Use StepUnit for a setup/identify/conclude step and "
            "InteractionUnit only if you want to check understanding. Leave "
            "empty ONLY if the turn turned out not to need worked math."
        ),
    )


# Solve-mode instructions: same tone + safety as the prose mentor, but the
# whiteboard authoring is handled by the structured schema (NO
# WHITEBOARD_INSTRUCTIONS here — that drives the free-form JSON-Lines prose
# path; structured output uses `output_schema` instead).
_SOLVE_INSTRUCTIONS = [
    "You are Athena, a warm and encouraging math mentor and coach.",
    "The student has asked you to work a specific equation. Solve it step by step "
    "on the whiteboard via the `units` field of your structured output.",
    "WHITEBOARD SOLVE: Author one TripletUnit per both-sides algebra operation "
    "(subtract, divide, distribute, etc.). Each TripletUnit renders as a complete "
    "APPLY/COLLAPSE/STATE morph, so you only write the plain-algebra strings "
    "(exprBefore / exprAfterApplied / exprAfterSimplified) and the spoken "
    "pedagogy — never author LaTeX or role tags yourself.",
    "MATH MUST BE write_math, NEVER write_text. Any step that DISPLAYS an "
    "equation, expression, formula, or value (the quadratic formula, a "
    "substitution, a simplification, 'a = 2, b = -1, c = -3', 'x = 3/2', etc.) "
    "MUST be a write_math StepUnit: set `equation_latex` to PLAIN LaTeX with NO "
    "surrounding $ and use \\frac (not \\dfrac). A StepUnit with no "
    "equation_latex (and no action_json) renders as write_text, which is PLAIN "
    "TEXT — it shows the dollar signs and \\frac/\\sqrt/\\pm raw and looks "
    "broken. So put NO math inside write_text.",
    "write_text is ONLY for short plain-language prose with no math symbols. For "
    "a 'label then equation' line (e.g. 'Plug in: x = ...'), put the label in "
    "`narration`/`displayText` and the equation in `equation_latex` on a "
    "write_math step — do not jam them into one write_text. Break a multi-line "
    "derivation (formula -> substituted -> simplified -> result) into one "
    "write_math step per line.",
    "Keep `reply_text` to 1-2 warm sentences; the whiteboard carries the math. "
    "`reply_text` must be plain spoken text with NO LaTeX, no $, no backslash "
    "commands (write 'plus or minus 8', never '\\pm 8').",
    "PREFER WORKED ALGEBRA: lead with the worked steps (TripletUnits for each "
    "both-sides operation; write_math StepUnits for the quadratic formula / "
    "factoring / the final answer). A graph is OPTIONAL supporting context, not "
    "the explanation — only add one after the algebra, if it genuinely helps.",
    "displayText / narration are the SPOKEN + caption layer (not what's drawn): "
    "in displayText wrap math in $...$ ('$x = 3$'); narration is plain speech. "
    "The DRAWN math always comes from `equation_latex`, never from $...$ in a "
    "write_text.",
    "COORDINATE_PLANE (only if you add one): the `function` element's `label` "
    "MUST be of the form 'y = <expr>' (e.g. 'y = 2x^2 - 4x - 6'), and every "
    "point in `points` must actually lie on that curve. A correct label lets "
    "the renderer sanity-check and repair the plotted points.",
    "Stay encouraging and concise, like a supportive older sibling who's been there. "
    "Do not lecture; let the worked steps do the teaching.",
    "CRITICAL FORMATTING RULE: Never use em-dashes. Replace with a comma, "
    "semicolon, colon, or rewrite the sentence.",
    "SAFETY: Stay focused on math and academic learning. If the request drifts "
    "off-topic or into disallowed territory, do not solve — but that routing is "
    "handled upstream, so assume this turn is a legitimate math solve request.",
]


def build_mentor_solve_agent(
    *,
    model=None,
    metadata: dict[str, str] | None = None,
) -> Agent:
    """Build the structured solve-mode mentor agent. Used only on turns the
    intent gate classifies as a worked-equation request."""
    return Agent(
        name="Athena Mentor Solve",
        model=model or claude(id="claude-sonnet-4-6", feature="mentor-solve", metadata=metadata),
        description="You are Athena, a math mentor working a specific equation step by step on the whiteboard.",
        instructions=_SOLVE_INSTRUCTIONS,
        markdown=True,
    )


mentor_solve_agent = build_mentor_solve_agent()


# Cheap keyword pre-filter: if none of these appear AND there's no '=' sign,
# the turn is almost certainly conversational and we skip the LLM gate call
# entirely. Keeps the common "how am I doing?" / "what should I study?" turns
# at zero added latency.
_SOLVE_HINT_RE = re.compile(
    r"\b(solve|simplify|factor|expand|evaluate|compute|work\s+(it|this)\s+out|"
    r"isolate|distribute|combine|find\s+x|what\s+is\s+x|step\s*by\s*step)\b",
    re.IGNORECASE,
)


def _looks_like_solve_request(question: str) -> bool:
    """Fast, dependency-free pre-filter. Returns True only if the text has a
    solve verb or an equation-shaped '=' (a var on at least one side). Used to
    short-circuit the LLM gate on obviously-conversational turns."""
    if _SOLVE_HINT_RE.search(question):
        return True
    # An equals sign flanked by something math-ish on both sides.
    if re.search(r"[0-9a-zA-Z)\]]\s*=\s*[-0-9a-zA-Z(]", question):
        return True
    return False


async def _classify_solve_intent(
    question: str,
    history: list[dict] | None = None,
    *,
    metadata: dict[str, str] | None = None,
) -> bool:
    """Decide whether this mentor turn should be worked as an equation solve
    on the whiteboard. A cheap Haiku one-token call routed through the
    gateway. Sees recent history so an image-confirm -> "yes" -> solve
    sequence classifies correctly. Defaults to False (prose) on any error or
    ambiguity — a false negative just keeps today's behavior."""
    # Zero-cost short-circuit for plainly conversational turns.
    if not _looks_like_solve_request(question) and not (history and any(
        _looks_like_solve_request(m.get("content", "")) for m in history[-3:]
    )):
        return False

    history_text = ""
    if history:
        lines = []
        for msg in history[-6:]:
            role = "Student" if msg.get("role") == "user" else "Athena"
            lines.append(f"{role}: {msg.get('content', '')}")
        history_text = "\n[RECENT CONVERSATION]\n" + "\n".join(lines) + "\n"

    prompt = (
        "You route messages for a math mentor. Decide whether the student is "
        "asking the mentor to WORK A SPECIFIC EQUATION step by step (solve, "
        "simplify, factor, expand, evaluate a concrete expression).\n"
        f"{history_text}\n"
        f'Student\'s latest message: "{question}"\n\n'
        "Reply with ONLY one word on its own line:\n"
        "- SOLVE if they want a specific equation/expression worked out "
        "(including a 'yes' that confirms an equation you just read back).\n"
        "- CHAT for anything else: motivation, progress questions, concept "
        "explanations, study plans, greetings, or off-topic.\n"
        "One word only. Do not explain."
    )
    try:
        gate_agent = Agent(
            name="Athena Mentor Intent",
            model=claude(id="claude-haiku-4-5", feature="mentor-intent", metadata=metadata),
            description="Routes mentor messages to solve vs chat.",
        )
        run_output = await gate_agent.arun(prompt, stream=False)
        text = (getattr(run_output, "content", "") or "").strip().upper()
        return text.startswith("SOLVE")
    except Exception as exc:  # pragma: no cover - defensive
        sys.stderr.write(f"[mentor] intent gate failed, defaulting to chat: {exc}\n")
        return False


def _strip_math_for_narration(text: str) -> str:
    """Best-effort: strip `$...$` math spans and stray LaTeX so a reply_text
    used as a step `narration` doesn't trip the front-end output-contract
    checker (which warns on $, \\, {, } in narration). displayText keeps the
    original."""
    out = re.sub(r"\$[^$]*\$", "", text)
    out = out.replace("\\", "").replace("{", "").replace("}", "").replace("$", "")
    return re.sub(r"\s{2,}", " ", out).strip()


def _densify_coord_plane_functions(lines: list[str]) -> list[str]:
    """Regenerate a DENSE point set for each coordinate_plane `function`
    element whose `label` parses as `y = <expr>`.

    The whiteboard plots functions as a Catmull-Rom spline through the
    authored `points`. The model often emits only a few landmark points
    (roots + vertex), which are individually on-curve — so the lesson's
    `_validate_coord_plane_function_points` (which only corrects off-curve
    y-values) leaves them as-is — yet the spline overshoots between them and
    the parabola visibly wiggles. Sampling ~50 points across the plane's
    xRange makes the spline trace the true curve. Mentor-only so the lesson's
    behavior is untouched."""
    SAMPLES = 49
    out: list[str] = []
    for line in lines:
        try:
            step = json.loads(line)
        except (json.JSONDecodeError, TypeError):
            out.append(line)
            continue
        if not isinstance(step, dict):
            out.append(line)
            continue
        action = step.get("action")
        if not isinstance(action, dict) or action.get("type") != "coordinate_plane":
            out.append(line)
            continue
        elements = action.get("elements")
        if not isinstance(elements, list):
            out.append(line)
            continue

        xrange = action.get("xRange")
        mutated = False
        for el in elements:
            if not isinstance(el, dict) or el.get("type") != "function":
                continue
            label = el.get("label")
            evaluator = _parse_function_label_to_evaluator(label) if isinstance(label, str) else None
            if evaluator is None:
                continue

            # Domain: the plane's xRange; fall back to the authored points'
            # x-extent so we never invent a wider span than intended.
            xmin = xmax = None
            if isinstance(xrange, list) and len(xrange) == 2:
                try:
                    xmin, xmax = float(xrange[0]), float(xrange[1])
                except (TypeError, ValueError):
                    xmin = xmax = None
            if xmin is None:
                xs = [
                    float(p[0])
                    for p in (el.get("points") or [])
                    if isinstance(p, list) and len(p) >= 2
                ]
                if len(xs) >= 2:
                    xmin, xmax = min(xs), max(xs)
            if xmin is None or xmax is None or xmax <= xmin:
                continue

            new_points: list[list] = []
            for i in range(SAMPLES):
                x = xmin + (xmax - xmin) * i / (SAMPLES - 1)
                try:
                    y = evaluator(x)
                except Exception:
                    continue
                x_out = int(round(x)) if abs(x - round(x)) < 1e-9 else round(x, 3)
                y_out = int(round(y)) if abs(y - round(y)) < 1e-9 else round(y, 3)
                new_points.append([x_out, y_out])
            if len(new_points) >= 2:
                el["points"] = new_points
                mutated = True
                sys.stderr.write(
                    f"[mentor] densified coord_plane function {label!r} "
                    f"to {len(new_points)} points\n"
                )
        out.append(json.dumps(step, ensure_ascii=False) if mutated else line)
    return out


def _build_mentor_prompt(
    question: str,
    student_context: dict,
    history: list[dict] | None = None,
) -> str:
    context_json = json.dumps(student_context, indent=2)

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
        f"[STUDENT PROGRESS DATA]\n"
        f"{context_json}\n"
        f"[END STUDENT DATA]\n"
        f"{history_text}\n"
        f"Student's message: {question}\n\n"
        "Respond as a supportive mentor. Reference their real data when relevant. "
        "Be specific, not generic."
    )


async def _render_mentor_solve(
    prompt: str,
    solve_agent: Agent,
) -> list[str] | None:
    """Run the structured solve path: a one-shot tool-use call (with one
    retry for the grammar service's transient 503s) producing a
    `MentorSolveOutput`, then flatten its units into whiteboard JSON-Lines
    via the shared `_flatten_units_to_steps`.

    Returns the flattened lines, or None to signal "fall back to prose" —
    when the model produced no worked units, parsing failed after the
    retry, or flattening yielded nothing."""
    parsed: MentorSolveOutput | None = None
    for attempt in range(2):
        run_output = await solve_agent.arun(
            prompt,
            stream=False,
            output_schema=MentorSolveOutput,
        )
        for attr in ("content", "structured_output", "output"):
            value = getattr(run_output, attr, None)
            if isinstance(value, MentorSolveOutput):
                parsed = value
                break
            if isinstance(value, dict):
                try:
                    parsed = MentorSolveOutput.model_validate(value)
                    break
                except Exception:
                    pass
        if parsed is not None:
            break
        sys.stderr.write(
            f"[mentor] solve tool-use attempt {attempt + 1} did not yield a "
            f"parsed MentorSolveOutput; retrying once.\n"
        )

    # No worked units → let the caller fall back to the prose path so the
    # student still gets a spoken answer (rather than a bare delimiter the
    # front-end's zero-step fallback would blank out).
    if parsed is None or not parsed.units:
        return None

    units: list = list(parsed.units)
    reply = (parsed.reply_text or "").strip()
    if reply:
        # Prepend the spoken intro as a write_text StepUnit so it is both
        # narrated (TTS plays per-step narration) and persists into the
        # finalized caption (the front-end joins step displayText). Strip
        # math from narration to satisfy the output-contract checker; keep
        # the original in displayText.
        units.insert(
            0,
            StepUnit(
                operation="setup",
                narration=_strip_math_for_narration(reply) or reply,
                displayText=reply,
            ),
        )

    lines = _flatten_units_to_steps(units)

    # Deterministic post-passes — the same ones the lesson generator runs
    # after flattening. Each is defensive (logs + returns input on error)
    # so a bad pass never sinks the turn:
    #   - sanitize interaction narrations (answer-leak guard),
    #   - collapse adjacent duplicate write_math,
    #   - recompute coordinate_plane `function` points that don't lie on
    #     their `y = <expr>` label (fixes distorted parabolas).
    for _pass in (
        _sanitize_interaction_narrations,
        _collapse_near_duplicate_steps,
        _validate_coord_plane_function_points,
        _densify_coord_plane_functions,
    ):
        try:
            lines = _pass(lines)
        except Exception as exc:  # pragma: no cover - defensive
            sys.stderr.write(f"[mentor] solve post-pass {_pass.__name__} failed: {exc}\n")

    return lines or None


async def ask_mentor_stream(
    question: str,
    student_context: dict,
    history: list[dict] | None = None,
    *,
    agent: Agent | None = None,
    solve_agent: Agent | None = None,
    metadata: dict[str, str] | None = None,
    image_base64: str | None = None,
    image_media_type: str | None = None,
):
    """Stream mentor response, yielding content chunks. Pass `agent` (and
    `solve_agent` + `metadata`) from the SSE handler to thread per-request
    gateway metadata; all default to module singletons.

    When `MENTOR_TOOL_USE=1`, each turn is routed: an intent gate decides
    whether the student is asking to work a specific equation. Solve-intent
    turns take the structured IR path (triplet morphs on the whiteboard,
    identical machinery to the micro-lesson generator); everything else —
    plus any image-attachment turn (image-first confirm must run) and any
    structured failure — takes the existing prose stream unchanged.

    When `image_base64` is provided, the turn becomes multimodal — the
    image is decoded and attached to the Agno `agent.arun(...)` call
    via the `images=[Image(...)]` parameter, which Agno forwards to
    Claude as a vision content block. Only this turn sees the image
    (no persistence in `history`).
    """
    prompt = _build_mentor_prompt(question, student_context, history)
    agent = agent or mentor_agent

    images: list[Image] | None = None
    if image_base64 and image_media_type:
        try:
            image_bytes = base64.b64decode(image_base64)
            # Derive Agno's `format` ("png", "jpeg", ...) from the
            # media type. Agno uses it to construct the provider-
            # specific image payload; the media type itself is
            # passed straight through for Claude's content block.
            fmt = image_media_type.split("/", 1)[-1].lower()
            images = [
                Image(
                    content=image_bytes,
                    mime_type=image_media_type,
                    format=fmt,
                )
            ]
        except (ValueError, TypeError) as e:
            # Bad base64 → log and fall back to text-only. Better
            # than failing the whole turn for a corrupt attachment.
            print(f"[mentor] dropped malformed image attachment: {e}")
            images = None

    # ── Router: structured solve path vs prose path ──────────────────────
    # Only when the flag is on, there's no image attached (image-first
    # confirm must run on the prose path), and the gate says "solve". Any
    # failure here falls through to the prose stream below.
    if os.getenv("MENTOR_TOOL_USE") == "1" and not images:
        try:
            if await _classify_solve_intent(question, history, metadata=metadata):
                solve_agent_ = solve_agent or mentor_solve_agent
                lines = await _render_mentor_solve(prompt, solve_agent_)
                if lines is not None:
                    yield "<<<WHITEBOARD>>>\n"
                    for line in lines:
                        yield line.replace("—", " - ") + "\n"
                    return
        except Exception as exc:
            sys.stderr.write(
                f"[mentor] solve path failed, falling back to prose: {exc}\n"
            )

    if images:
        response_stream = agent.arun(prompt, images=images, stream=True)
    else:
        response_stream = agent.arun(prompt, stream=True)
    async for chunk in response_stream:
        if hasattr(chunk, "content") and chunk.content:
            yield chunk.content.replace("—", " - ")
