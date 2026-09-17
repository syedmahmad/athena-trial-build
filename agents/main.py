"""
Athena AI Agent service — FastAPI server for lesson generation and tutoring.

The tutor agents control the whiteboard directly — their responses can
include a <<<WHITEBOARD>>> delimiter followed by JSON Lines whiteboard steps.
This server parses the mixed format and sends separate SSE events for text
tokens and whiteboard steps.
"""

import asyncio
import base64
import json
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# Must run before any app.* import: several agent modules build Agno agents
# at import time via claude(), which reads MAJORDOMO_ENABLED/ANTHROPIC_API_KEY
# from the environment. Loading .env after those imports (as this used to)
# means MAJORDOMO_ENABLED defaults to "1" during import and every agent
# module crashes on load unless MAJORDOMO_API_KEY happens to already be
# exported in the shell.
load_dotenv()

from app.utils.llm_client import anthropic_client
from app.run_time.sat.tutoring_agent import ask_tutor_stream, build_tutoring_agent
from app.run_time.sat.quiz_tutor_agent import ask_quiz_tutor_stream, build_quiz_tutor_agent
from app.run_time.sat.mentor_agent import (
    ask_mentor_stream,
    build_mentor_agent,
    build_mentor_solve_agent,
)
from app.run_time.sat.micro_lesson_agent import (
    build_critique_agent,
    build_micro_lesson_agent,
    build_micro_lesson_chat_agent,
    build_pulse_check_inserter_agent,
    generate_micro_lesson_stream,
    micro_lesson_chat_stream,
)
from app.run_time.sat.podcast_agent import (
    build_podcast_agent,
    generate_podcast_script,
)
from app.run_time.sat.infographic_agent import (
    build_infographic_brief_agent,
    generate_infographic,
)
from app.run_time.sat.why_this_matters_agent import (
    build_why_this_matters_agent,
    generate_why_stream,
)
from app.run_time.sat.flashcard_agent import (
    regenerate_one_card,
    stream_flashcard_deck,
)
from app.run_time.dynamic.my_learning_generator import generate_my_learning_content
from app.run_time.dynamic.my_learning_lesson_agent import (
    build_my_learning_chat_agent,
    build_my_learning_lesson_agent,
    generate_my_learning_lesson_stream,
    my_learning_lesson_chat_stream,
)
from app.run_time.dynamic.my_learning_quiz_tutor_agent import (
    ask_my_learning_quiz_tutor_stream,
    build_my_learning_quiz_tutor_agent,
)
from app.run_time.dynamic.lesson_plan_classifier import classify_lesson_plan
from app.pre_generation.problem_generator import (
    build_problem_agent,
    generate_problems_batch,
    generate_problems_streaming,
)
from app.reports.report_pdf_agent import analyze_report
from app.studio.router import router as studio_router
from app.educator.router import router as educator_router
from eval_math_shim import task_equivalence
from app.cron.session_reminders import session_reminder_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(session_reminder_loop())
    yield
    task.cancel()


app = FastAPI(title="Athena Agents", version="0.1.0", lifespan=lifespan)

_extra_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", *_extra_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(studio_router, prefix="/studio/agents", tags=["studio"])
app.include_router(educator_router, prefix="/educator", tags=["educator"])

WHITEBOARD_DELIMITER = "<<<WHITEBOARD>>>"


class RequestMetadata(BaseModel):
    """Per-request metadata threaded into the Majordomo gateway headers.

    All fields are optional — the Next.js proxy routes populate them from
    Clerk + URL params, but legacy / direct callers can omit them. The
    SSE handlers below pass these into the per-request `build_*_agent(metadata=...)`
    factory so each call is tagged in the dashboard with User-Id, Topic,
    etc.
    """
    user_id: str | None = None       # Clerk user id (opaque, no PII)
    topic: str | None = None          # topic slug (e.g. "algebra")
    subtopic: str | None = None       # subtopic slug
    lesson_id: str | None = None      # lesson id (SAT) or topic id (my-learning)


def _md_headers(meta: RequestMetadata | None) -> dict[str, str]:
    """Convert RequestMetadata → X-Majordomo-* header dict. Skips empty
    fields so the gateway doesn't see meaningless tags."""
    if meta is None:
        return {}
    out: dict[str, str] = {}
    if meta.user_id:
        out["User-Id"] = meta.user_id
    if meta.topic:
        out["Topic"] = meta.topic
    if meta.subtopic:
        out["Subtopic"] = meta.subtopic
    if meta.lesson_id:
        out["Lesson-Id"] = meta.lesson_id
    return out


class ChatRequest(BaseModel):
    question: str
    lesson_title: str
    lesson_content: str
    # Opt-in from the SAT-branded surface: restores the SAT Math tutor
    # persona wording. Default keeps the neutral Athena wording unchanged.
    sat_focused: bool = False
    request_metadata: RequestMetadata = RequestMetadata()


class MentorChatMessage(BaseModel):
    role: str
    content: str


class MentorChatRequest(BaseModel):
    question: str
    history: list[MentorChatMessage] = []
    student_context: dict = {}
    # Optional multimodal image attachment. When `image_base64` is
    # provided, the agent receives the image as a Claude vision
    # content block alongside the text question. `image_media_type`
    # tells Claude how to interpret the bytes — e.g. "image/png".
    image_base64: Optional[str] = None
    image_media_type: Optional[str] = None
    request_metadata: RequestMetadata = RequestMetadata()


class QuizChatMessage(BaseModel):
    role: str
    content: str


class QuizChatRequest(BaseModel):
    question: str
    topic: str
    subtopic: str
    question_text: str
    options: list[str]
    hint: str
    solution_steps: list[dict]
    correct_option: int
    student_answer: int | None = None
    history: list[QuizChatMessage] = []
    # Opt-in from the SAT-branded surface: restores the Socratic SAT Math
    # tutor persona. Never applied to general academic subjects.
    sat_focused: bool = False
    request_metadata: RequestMetadata = RequestMetadata()


async def stream_with_whiteboard(
    raw_stream: AsyncGenerator[str, None],
) -> AsyncGenerator[str, None]:
    """Parse a tutor's mixed text+whiteboard stream into separate SSE events.

    Before <<<WHITEBOARD>>>: emit {"token": "..."} events.
    After <<<WHITEBOARD>>>: emit {"wb_step": {...}} events for each JSON object.

    Handles the delimiter being split across multiple chunks, and handles
    multiple JSON objects on a single line (brace-depth parsing).
    """
    state = "text"
    buffer = ""
    step_id_counter = 0

    async for chunk in raw_stream:
        if state == "text":
            buffer += chunk

            if WHITEBOARD_DELIMITER in buffer:
                before, after = buffer.split(WHITEBOARD_DELIMITER, 1)
                # Flush any text before the delimiter
                text_to_send = before.rstrip("\n")
                if text_to_send:
                    yield f"data: {json.dumps({'token': text_to_send})}\n\n"
                state = "whiteboard"
                buffer = after
                # Try to extract any complete JSON objects already in the buffer
                for step in _extract_steps(buffer):
                    step["id"] = step_id_counter
                    step_id_counter += 1
                    yield f"data: {json.dumps({'wb_step': step})}\n\n"
                buffer = _remaining_after_extraction(buffer)
            else:
                # Hold back any suffix that could be the start of <<<WHITEBOARD>>>
                # Must find the LONGEST matching prefix, not the shortest.
                hold_back = 0
                for i in range(1, min(len(WHITEBOARD_DELIMITER), len(buffer) + 1)):
                    if buffer.endswith(WHITEBOARD_DELIMITER[:i]):
                        hold_back = i
                # Do NOT break — keep checking for longer prefixes

                safe_end = len(buffer) - hold_back
                if safe_end > 0:
                    flush = buffer[:safe_end]
                    buffer = buffer[safe_end:]
                    yield f"data: {json.dumps({'token': flush})}\n\n"
        else:
            # Whiteboard mode — extract complete JSON objects
            buffer += chunk
            for step in _extract_steps(buffer):
                step["id"] = step_id_counter
                step_id_counter += 1
                yield f"data: {json.dumps({'wb_step': step})}\n\n"
            buffer = _remaining_after_extraction(buffer)

    # Flush remaining buffer
    if state == "text" and buffer.strip():
        if WHITEBOARD_DELIMITER in buffer:
            before, after = buffer.split(WHITEBOARD_DELIMITER, 1)
            if before.strip():
                yield f"data: {json.dumps({'token': before.rstrip()})}\n\n"
            for step in _extract_steps(after):
                step["id"] = step_id_counter
                step_id_counter += 1
                yield f"data: {json.dumps({'wb_step': step})}\n\n"
        else:
            yield f"data: {json.dumps({'token': buffer})}\n\n"
    elif state == "whiteboard" and buffer.strip():
        for step in _extract_steps(buffer):
            step["id"] = step_id_counter
            step_id_counter += 1
            yield f"data: {json.dumps({'wb_step': step})}\n\n"

    yield "data: [DONE]\n\n"


def _extract_steps(text: str) -> list[dict]:
    """Extract all complete JSON objects from text using brace-depth tracking.

    Handles multiple objects on one line, objects split across lines, etc.
    Returns a list of parsed step dicts.
    """
    steps = []
    depth = 0
    start = -1

    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start >= 0:
                candidate = text[start : i + 1]
                try:
                    obj = json.loads(candidate)
                    if isinstance(obj, dict) and "action" in obj:
                        obj.setdefault("durationMs", 800)
                        obj.setdefault("delayMs", 200)
                        steps.append(obj)
                except json.JSONDecodeError:
                    pass
                start = -1

    return steps


def _remaining_after_extraction(text: str) -> str:
    """Return the trailing portion of text after the last complete JSON object.

    If there's an incomplete object at the end (open brace without matching
    close), returns from that opening brace onward so the next chunk can
    complete it.
    """
    depth = 0
    last_complete_end = -1

    for i, ch in enumerate(text):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                last_complete_end = i + 1

    if last_complete_end >= 0:
        return text[last_complete_end:]
    # No complete objects found — keep entire buffer (might be partial)
    # But strip leading whitespace/newlines since they're not useful
    stripped = text.lstrip(" \t\n")
    if "{" in stripped:
        return stripped
    return ""


@app.post("/chat/stream")
async def chat_stream_endpoint(req: ChatRequest):
    # No topic in this request body, so no subject lookup is possible here;
    # only the SAT-branded surface sets the flag.
    agent = build_tutoring_agent(
        metadata=_md_headers(req.request_metadata),
        sat_focused=req.sat_focused,
    )

    async def event_generator():
        try:
            raw = ask_tutor_stream(
                question=req.question,
                lesson_title=req.lesson_title,
                lesson_content=req.lesson_content,
                agent=agent,
            )
            async for event in stream_with_whiteboard(raw):
                yield event
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/mentor-chat/stream")
async def mentor_chat_stream_endpoint(req: MentorChatRequest):
    history = [m.model_dump() for m in req.history] if req.history else None
    md = _md_headers(req.request_metadata)
    agent = build_mentor_agent(metadata=md)
    # Lazily-used solve agent for the structured triplet path (only when
    # MENTOR_TOOL_USE=1 and the intent gate routes the turn there).
    solve_agent = build_mentor_solve_agent(metadata=md)

    async def event_generator():
        try:
            raw = ask_mentor_stream(
                question=req.question,
                student_context=req.student_context,
                history=history,
                agent=agent,
                solve_agent=solve_agent,
                metadata=md,
                image_base64=req.image_base64,
                image_media_type=req.image_media_type,
            )
            async for event in stream_with_whiteboard(raw):
                yield event
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/quiz-chat/stream")
async def quiz_chat_stream_endpoint(req: QuizChatRequest):
    history = [m.model_dump() for m in req.history] if req.history else None
    # If the body doesn't carry topic/subtopic in request_metadata, fall back
    # to the top-level fields the quiz endpoint has always required.
    md = _md_headers(req.request_metadata)
    md.setdefault("Topic", req.topic)
    md.setdefault("Subtopic", req.subtopic)
    # SAT framing only for SAT subjects; the subject lookup (one DB read)
    # runs only when the caller opted in, so default requests are untouched.
    sat_focused = req.sat_focused and _resolve_subject(req.topic) in (
        "math",
        "reading-writing",
    )
    agent = build_quiz_tutor_agent(metadata=md, sat_focused=sat_focused)

    async def event_generator():
        try:
            raw = ask_quiz_tutor_stream(
                question=req.question,
                topic=req.topic,
                subtopic=req.subtopic,
                question_text=req.question_text,
                options=req.options,
                hint=req.hint,
                solution_steps=req.solution_steps,
                correct_option=req.correct_option,
                student_answer=req.student_answer,
                history=history,
                agent=agent,
            )
            async for event in stream_with_whiteboard(raw):
                yield event
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


class MicroLessonKeyFormula(BaseModel):
    latex: str = ""
    description: str = ""


class MicroLessonCommonMistake(BaseModel):
    mistake: str = ""
    correction: str = ""
    why: str = ""


class MicroLessonConceptualOverview(BaseModel):
    definition: str = ""
    real_world_example: str = ""
    sat_context: str = ""


class MicroLessonRequest(BaseModel):
    topic: str
    subtopic: str
    description: str = ""
    learning_objectives: list[str] = []
    key_formulas: list[MicroLessonKeyFormula] = []
    common_mistakes: list[MicroLessonCommonMistake] = []
    tips_and_tricks: list[str] = []
    conceptual_overview: MicroLessonConceptualOverview | None = None
    # Opt-in from the SAT-branded surface: restores SAT-focused prompt
    # framing (persona + "SAT context:" label). Never applied to general
    # academic subjects (science, social-studies), regardless of the flag.
    sat_focused: bool = False
    request_metadata: RequestMetadata = RequestMetadata()


class MicroLessonChatMessage(BaseModel):
    role: str
    content: str


class MicroLessonChatRequest(BaseModel):
    question: str
    topic: str
    subtopic: str
    lesson_summary: str
    lesson_steps: list[dict] = []
    metadata: dict = {}  # lesson context (key_formulas, mistakes, …) — see also `request_metadata`
    current_step_index: int = 0
    history: list[MicroLessonChatMessage] = []
    # Optional multimodal image attachment from the student. When
    # `image_base64` is provided, the chat turn becomes multimodal —
    # Claude vision sees the image alongside the question.
    image_base64: Optional[str] = None
    image_media_type: Optional[str] = None
    # Opt-in from the SAT-branded surface: restores the SAT persona in the
    # follow-up chat agent. Never applied to general academic subjects.
    sat_focused: bool = False
    request_metadata: RequestMetadata = RequestMetadata()


async def _with_heartbeat(source, interval: float = 10.0):
    """Wrap an SSE async-generator, emitting ``: keep-alive`` comment frames
    during idle gaps.

    The micro-lesson generator under MICROLESSON_TOOL_USE=1 is one-shot: it
    sends NO bytes for ~60-90s while the model + self-critique + pulse-check
    passes run, then emits the whole lesson at once. On a slow / mobile
    connection (mobile-carrier, NAT, proxy, or Tailscale idle timeouts) that
    silent gap drops the connection and the client renders "Signal lost".
    A periodic comment frame keeps the connection warm.

    Comment lines (leading ':') are ignored by EventSource AND by our
    `data: `-prefixed client parser (use-micro-lesson.ts), so they are inert
    on the success path; the Next route pipes `res.body` through unchanged so
    the frames reach the browser.
    """
    ait = source.__aiter__()
    pending = asyncio.ensure_future(ait.__anext__())
    try:
        while True:
            done, _ = await asyncio.wait({pending}, timeout=interval)
            if not done:
                yield ": keep-alive\n\n"
                continue
            try:
                item = pending.result()
            except StopAsyncIteration:
                return
            yield item
            pending = asyncio.ensure_future(ait.__anext__())
    finally:
        if not pending.done():
            pending.cancel()


def _resolve_subject(topic_name: str) -> str:
    """Resolve a topic's subject by name (e.g. 'math', 'science'). Falls back
    to 'math' on any miss so SAT/reading surfaces are never affected. Used by
    the lesson / infographic / podcast endpoints to drop SAT framing for
    general academic subjects (science, social-studies)."""
    try:
        from app.utils.db import client as _db_client
        rows = (
            _db_client()
            .table("topics")
            .select("subject")
            .eq("name", topic_name)
            .limit(1)
            .execute()
            .data
        )
        if rows and rows[0].get("subject"):
            return rows[0]["subject"]
    except Exception:
        pass
    return "math"


async def _inject_curated_image(events, *, topic: str, subtopic: str, subject: str):
    """Splice a curated open-license image step into a parsed whiteboard SSE
    stream for general-academic subjects (science, social-studies).

    Mirrors the bulk seeder (``seed_lesson_images.py``): one attributed
    Wikimedia Commons illustration, placed right after the lesson's opening
    ``section_heading``. The lookup runs CONCURRENTLY with generation — which
    is one-shot and emits nothing for ~60-90s — so it is ready well before the
    first step arrives. The browser reassigns step ids on arrival and saves the
    accumulated steps back to the cache, so the injected image both renders and
    persists with no client/route change.

    Best-effort and non-blocking: SAT/math subjects pass straight through; any
    lookup failure or timeout simply yields no image and never disturbs the
    lesson. ``stream_with_whiteboard`` always terminates with ``[DONE]``, so a
    lesson with no section heading still gets the image as a final fallback.
    """
    if subject in ("math", "reading-writing"):
        async for e in events:
            yield e
        return

    from app.utils.lesson_images import build_image_action

    img_task = asyncio.ensure_future(build_image_action(topic, subtopic, subject))
    injected = False

    async def _image_frame() -> str | None:
        try:
            built = await asyncio.wait_for(img_task, timeout=12.0)
        except Exception:
            return None
        if not built:
            return None
        return f"data: {json.dumps({'wb_step': built['step']})}\n\n"

    try:
        async for frame in events:
            stripped = frame.strip()
            if stripped == "data: [DONE]":
                if not injected:  # fallback: no section heading appeared
                    f = await _image_frame()
                    if f:
                        yield f
                    injected = True
                yield frame
                continue
            yield frame
            if injected or not stripped.startswith("data:"):
                continue
            try:
                obj = json.loads(stripped[len("data:"):].strip())
            except Exception:
                continue
            step = obj.get("wb_step") if isinstance(obj, dict) else None
            if step and (step.get("action") or {}).get("type") == "section_heading":
                f = await _image_frame()
                if f:
                    yield f
                injected = True  # placed (or nothing relevant) — don't retry
    finally:
        if not img_task.done():
            img_task.cancel()


@app.post("/micro-lesson/stream")
async def micro_lesson_stream_endpoint(req: MicroLessonRequest):
    metadata = {
        "description": req.description,
        "learning_objectives": req.learning_objectives,
        "key_formulas": [f.model_dump() for f in req.key_formulas],
        "common_mistakes": [m.model_dump() for m in req.common_mistakes],
        "tips_and_tricks": req.tips_and_tricks,
        "conceptual_overview": req.conceptual_overview.model_dump() if req.conceptual_overview else None,
    }
    md = _md_headers(req.request_metadata)
    md.setdefault("Topic", req.topic)
    md.setdefault("Subtopic", req.subtopic)
    md.setdefault("Microlesson-Variant", os.getenv("MICROLESSON_PROMPT_VARIANT", ""))

    # Drop SAT/math framing for general-academic subjects (science, social-studies).
    subject = _resolve_subject(req.topic)

    lesson_agent = build_micro_lesson_agent(
        metadata=md, sat_focused=req.sat_focused, subject=subject
    )
    crit_agent = build_critique_agent(metadata=md)
    pulse_agent = build_pulse_check_inserter_agent(metadata=md)

    async def event_generator():
        try:
            raw = generate_micro_lesson_stream(
                topic=req.topic,
                subtopic=req.subtopic,
                subtopic_metadata=metadata,
                subject=subject,
                sat_focused=req.sat_focused,
                agent=lesson_agent,
                critique_agent=crit_agent,
                pulse_check_agent=pulse_agent,
            )
            parsed = stream_with_whiteboard(raw)
            with_image = _inject_curated_image(
                parsed, topic=req.topic, subtopic=req.subtopic, subject=subject
            )
            async for event in _with_heartbeat(with_image):
                yield event
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/why-this-matters/stream")
async def why_this_matters_stream_endpoint(req: MicroLessonRequest):
    metadata = {
        "description": req.description,
        "learning_objectives": req.learning_objectives,
        "key_formulas": [f.model_dump() for f in req.key_formulas],
        "common_mistakes": [m.model_dump() for m in req.common_mistakes],
        "tips_and_tricks": req.tips_and_tricks,
        "conceptual_overview": req.conceptual_overview.model_dump() if req.conceptual_overview else None,
    }
    md = _md_headers(req.request_metadata)
    md.setdefault("Topic", req.topic)
    md.setdefault("Subtopic", req.subtopic)
    agent = build_why_this_matters_agent(metadata=md)

    async def event_generator():
        try:
            raw = generate_why_stream(
                topic=req.topic,
                subtopic=req.subtopic,
                subtopic_metadata=metadata,
                agent=agent,
            )
            async for event in stream_with_whiteboard(raw):
                yield event
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/micro-lesson/chat/stream")
async def micro_lesson_chat_stream_endpoint(req: MicroLessonChatRequest):
    history = [m.model_dump() for m in req.history] if req.history else None
    md = _md_headers(req.request_metadata)
    md.setdefault("Topic", req.topic)
    md.setdefault("Subtopic", req.subtopic)
    # Subject lookup (one DB read) only when the SAT-branded surface opted
    # in; the builder itself never applies SAT framing to general subjects.
    subject = _resolve_subject(req.topic) if req.sat_focused else "math"
    agent = build_micro_lesson_chat_agent(
        metadata=md, sat_focused=req.sat_focused, subject=subject
    )

    async def event_generator():
        try:
            raw = micro_lesson_chat_stream(
                question=req.question,
                topic=req.topic,
                subtopic=req.subtopic,
                lesson_summary=req.lesson_summary,
                lesson_steps=req.lesson_steps or None,
                metadata=req.metadata or None,
                current_step_index=req.current_step_index,
                history=history,
                agent=agent,
                image_base64=req.image_base64,
                image_media_type=req.image_media_type,
            )
            async for event in stream_with_whiteboard(raw):
                yield event
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


class PodcastScriptRequest(BaseModel):
    topic: str
    subtopic: str
    description: str = ""
    learning_objectives: list[str] = []
    key_formulas: list[MicroLessonKeyFormula] = []
    common_mistakes: list[MicroLessonCommonMistake] = []
    tips_and_tricks: list[str] = []
    conceptual_overview: MicroLessonConceptualOverview | None = None
    request_metadata: RequestMetadata = RequestMetadata()


@app.post("/podcast-script")
async def podcast_script_endpoint(req: PodcastScriptRequest):
    """Generate a structured podcast script for one (topic, subtopic).

    One-shot tool-use call — no streaming. Returns the full
    PodcastScript JSON. The Next.js orchestrator persists this to the
    podcast_scripts table and serves it to the client.
    """
    if not req.topic.strip() or not req.subtopic.strip():
        raise HTTPException(status_code=400, detail="topic and subtopic are required")

    md = _md_headers(req.request_metadata)
    md.setdefault("Topic", req.topic)
    md.setdefault("Subtopic", req.subtopic)
    agent = build_podcast_agent(metadata=md)

    # Drop SAT-specific context for general academic subjects so it does not
    # leak into the spoken dialogue.
    subject = _resolve_subject(req.topic)
    conceptual_overview = (
        req.conceptual_overview.model_dump() if req.conceptual_overview else None
    )
    if conceptual_overview and subject not in ("math", "reading-writing"):
        conceptual_overview = {
            k: v for k, v in conceptual_overview.items() if k != "sat_context"
        }

    try:
        script = await generate_podcast_script(
            topic=req.topic,
            subtopic=req.subtopic,
            description=req.description,
            learning_objectives=req.learning_objectives,
            key_formulas=[f.model_dump() for f in req.key_formulas],
            common_mistakes=[m.model_dump() for m in req.common_mistakes],
            tips_and_tricks=req.tips_and_tricks,
            conceptual_overview=conceptual_overview,
            agent=agent,
        )
        return script.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class InfographicRequest(BaseModel):
    topic: str
    subtopic: str
    description: str = ""
    learning_objectives: list[str] = []
    key_formulas: list[MicroLessonKeyFormula] = []
    common_mistakes: list[MicroLessonCommonMistake] = []
    tips_and_tricks: list[str] = []
    conceptual_overview: MicroLessonConceptualOverview | None = None
    request_metadata: RequestMetadata = RequestMetadata()


@app.post("/infographic")
async def infographic_endpoint(req: InfographicRequest):
    """Generate one infographic for a (topic, subtopic).

    Returns the structured InfographicBrief alongside a base64-encoded
    PNG. The Next.js orchestrator uploads the PNG to Supabase Storage
    and persists the row in `infographics`.

    Wall time is ~45s (Claude brief ~5s + gpt-image-2 high quality
    ~30-60s). Callers must use a >60s timeout.
    """
    if not req.topic.strip() or not req.subtopic.strip():
        raise HTTPException(status_code=400, detail="topic and subtopic are required")

    md = _md_headers(req.request_metadata)
    md.setdefault("Topic", req.topic)
    md.setdefault("Subtopic", req.subtopic)
    # General academic subjects (science, social-studies) get a non-SAT audience.
    subject = _resolve_subject(req.topic)
    brief_agent = build_infographic_brief_agent(metadata=md, subject=subject)

    try:
        brief, png_bytes = await generate_infographic(
            topic=req.topic,
            subtopic=req.subtopic,
            description=req.description,
            learning_objectives=req.learning_objectives,
            key_formulas=[f.model_dump() for f in req.key_formulas],
            common_mistakes=[m.model_dump() for m in req.common_mistakes],
            tips_and_tricks=req.tips_and_tricks,
            conceptual_overview=(
                req.conceptual_overview.model_dump()
                if req.conceptual_overview
                else None
            ),
            brief_agent=brief_agent,
            metadata=md,
        )
        return {
            "brief": brief.model_dump(),
            "image_base64": base64.b64encode(png_bytes).decode("ascii"),
            "image_mime": "image/png",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class MyLearningRequest(BaseModel):
    topic: str
    request_metadata: RequestMetadata = RequestMetadata()


@app.post("/my-learning/lesson/stream")
async def my_learning_lesson_stream_endpoint(req: MicroLessonRequest):
    metadata = {
        "description": req.description,
        "learning_objectives": req.learning_objectives,
        "common_mistakes": [m.model_dump() for m in req.common_mistakes],
        "tips_and_tricks": req.tips_and_tricks,
    }
    md = _md_headers(req.request_metadata)
    md.setdefault("Topic", req.topic)
    md.setdefault("Subtopic", req.subtopic)
    agent = build_my_learning_lesson_agent(metadata=md)

    async def event_generator():
        try:
            raw = generate_my_learning_lesson_stream(
                topic=req.topic,
                subtopic=req.subtopic,
                metadata=metadata,
                agent=agent,
            )
            async for event in stream_with_whiteboard(raw):
                yield event
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/my-learning/lesson/chat/stream")
async def my_learning_lesson_chat_stream_endpoint(req: MicroLessonChatRequest):
    history = [m.model_dump() for m in req.history] if req.history else None
    md = _md_headers(req.request_metadata)
    md.setdefault("Topic", req.topic)
    md.setdefault("Subtopic", req.subtopic)
    agent = build_my_learning_chat_agent(metadata=md)

    async def event_generator():
        try:
            raw = my_learning_lesson_chat_stream(
                question=req.question,
                topic=req.topic,
                subtopic=req.subtopic,
                lesson_summary=req.lesson_summary,
                history=history,
                agent=agent,
            )
            async for event in stream_with_whiteboard(raw):
                yield event
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/my-learning/quiz-chat/stream")
async def my_learning_quiz_chat_stream_endpoint(req: QuizChatRequest):
    history = [m.model_dump() for m in req.history] if req.history else None
    md = _md_headers(req.request_metadata)
    md.setdefault("Topic", req.topic)
    md.setdefault("Subtopic", req.subtopic)
    agent = build_my_learning_quiz_tutor_agent(metadata=md)

    async def event_generator():
        try:
            raw = ask_my_learning_quiz_tutor_stream(
                question=req.question,
                topic=req.topic,
                subtopic=req.subtopic,
                question_text=req.question_text,
                options=req.options,
                hint=req.hint,
                solution_steps=req.solution_steps,
                correct_option=req.correct_option,
                student_answer=req.student_answer,
                history=history,
                agent=agent,
            )
            async for event in stream_with_whiteboard(raw):
                yield event
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/my-learning/generate")
async def my_learning_generate_endpoint(req: MyLearningRequest):
    if not req.topic.strip():
        raise HTTPException(status_code=400, detail="Topic is required")
    try:
        result = await generate_my_learning_content(req.topic)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class FlashcardStreamRequest(BaseModel):
    topic_slug: str
    subtopic_slug: str
    count: int = 12
    request_metadata: RequestMetadata = RequestMetadata()


@app.post("/flashcards/stream")
async def flashcards_stream_endpoint(req: FlashcardStreamRequest):
    if not req.topic_slug or not req.subtopic_slug:
        raise HTTPException(
            status_code=400,
            detail="topic_slug and subtopic_slug are required",
        )

    count = max(1, min(req.count, 30))

    async def event_generator():
        try:
            async for event in stream_flashcard_deck(
                req.topic_slug,
                req.subtopic_slug,
                count=count,
            ):
                yield event
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


class FlashcardRegenerateRequest(BaseModel):
    topic_slug: str
    subtopic_slug: str
    exclude_problem_ids: list[str] = []
    deck_index: int


@app.post("/flashcards/regenerate")
async def flashcards_regenerate_endpoint(req: FlashcardRegenerateRequest):
    if not req.topic_slug or not req.subtopic_slug:
        raise HTTPException(
            status_code=400,
            detail="topic_slug and subtopic_slug are required",
        )
    card = regenerate_one_card(
        req.topic_slug,
        req.subtopic_slug,
        exclude_problem_ids=req.exclude_problem_ids,
        deck_index=req.deck_index,
    )
    if not card:
        raise HTTPException(status_code=404, detail="No replacement card available")
    return {"card": card}


class PracticeProblemsRequest(BaseModel):
    topic: str
    subtopic: str
    subject: str = "math"


@app.post("/practice-problems")
async def practice_problems_endpoint(req: PracticeProblemsRequest):
    try:
        import random
        difficulty = random.choice(["easy", "medium", "hard"])
        problems = await generate_problems_batch(
            subtopic_name=req.subtopic,
            topic_name=req.topic,
            subtopic_id="practice",
            batch_number=0,
            difficulty=difficulty,
            batch_size=2,
            subject=req.subject,
        )
        return {"problems": [
            {
                "id": f"practice-{i}",
                "questionText": p["question_text"],
                "options": p["options"],
                "correctOption": p["correct_option"],
                "hint": p["hint"],
                "detailedHint": p.get("detailed_hint", ""),
                "solutionSteps": p["solution_steps"],
                "explanation": p["explanation"],
                "difficulty": p["difficulty"],
                "orderIndex": i,
                "timeRecommendationSeconds": 90,
            }
            for i, p in enumerate(problems)
        ]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class PracticeProblemsStreamRequest(BaseModel):
    topic: str
    subtopic: str
    subject: str = "math"
    count: int = 6
    # Prior outcomes [{isCorrect, difficulty}, …] — biases difficulty of the
    # next pool. Empty on the first wave. The adaptive seam.
    prior_answers: list[dict] = []
    # Stems of problems the student has already been served this session —
    # fed into generation so the next candidates target different areas.
    avoid_stems: list[str] = []
    request_metadata: RequestMetadata = RequestMetadata()


@app.post("/practice-problems/stream")
async def practice_problems_stream_endpoint(req: PracticeProblemsStreamRequest):
    """Stream freshly generated SAT problems one at a time.

    Each problem is an independent concurrent LLM call surfaced the instant
    it returns (fast first problem, pool filling behind). Wire format mirrors
    the other SSE endpoints: data: {meta}, data: {problem}, …, data: {done},
    data: [DONE]; errors arrive as data: {error}.
    """
    md = _md_headers(req.request_metadata)
    md.setdefault("Topic", req.topic)
    md.setdefault("Subtopic", req.subtopic)
    agent = build_problem_agent(metadata=md, feature="stream-problems")

    # Bound fan-out: a runaway count shouldn't open dozens of concurrent
    # LLM calls. Callers needing more problems request additional waves.
    count = max(1, min(req.count, 10))
    prior = req.prior_answers or None
    # Later waves rotate the prompt's problem-type focus so refills don't
    # repeat structures from earlier waves.
    batch_offset = len(req.prior_answers)

    async def event_generator():
        yield "data: " + json.dumps({
            "meta": {
                "topic": req.topic,
                "subtopic": req.subtopic,
                "subject": req.subject,
                "requestedCount": count,
            }
        }) + "\n\n"
        try:
            async for problem in generate_problems_streaming(
                subtopic_name=req.subtopic,
                topic_name=req.topic,
                subject=req.subject,
                count=count,
                prior_answers=prior,
                avoid_stems=req.avoid_stems or None,
                batch_offset=batch_offset,
                agent=agent,
            ):
                yield "data: " + json.dumps({"problem": problem}) + "\n\n"
            yield "data: " + json.dumps({"done": True}) + "\n\n"
        except Exception as e:
            yield "data: " + json.dumps({"error": str(e)}) + "\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


class LessonPlanClassifyRequest(BaseModel):
    plan: str
    request_metadata: RequestMetadata = RequestMetadata()


@app.post("/lesson-plan/classify")
async def lesson_plan_classify_endpoint(req: LessonPlanClassifyRequest):
    """Classify a free-form lesson plan onto our existing taxonomy.

    Returns matched subtopics + weights. Next.js orchestrates the rest:
    it queries Supabase for existing problems in the matched subtopics
    and routes the student into the standard SAT quiz UI."""
    if not req.plan.strip():
        raise HTTPException(status_code=400, detail="plan is required")
    try:
        classification, _ = await classify_lesson_plan(
            req.plan,
            metadata=_md_headers(req.request_metadata),
        )
        return {
            "subject": classification.subject,
            "matches": [
                {
                    "topicSlug": m.topic_slug,
                    "subtopicSlug": m.subtopic_slug,
                    "weight": m.weight,
                    "rationale": m.rationale,
                }
                for m in classification.matches
            ],
            "notes": classification.notes,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class LessonSummaryKeyFormula(BaseModel):
    latex: str = ""
    description: str = ""


class LessonSummaryScore(BaseModel):
    correct: int
    total: int


class LessonSummaryRequest(BaseModel):
    topic_name: str
    subtopic_name: str
    lesson_type: str
    score: LessonSummaryScore | None = None
    learning_objectives: list[str] = []
    key_formulas: list[LessonSummaryKeyFormula] = []
    request_metadata: RequestMetadata = RequestMetadata()


@app.post("/lesson-summary")
async def lesson_summary_endpoint(req: LessonSummaryRequest):
    score_context = (
        f"\nThe student scored {req.score.correct}/{req.score.total} on the practice problems."
        if req.score
        else ""
    )
    objectives_context = (
        f"\nLearning objectives covered: {'; '.join(req.learning_objectives)}"
        if req.learning_objectives
        else ""
    )
    formulas_context = (
        f"\nKey formulas used: {'; '.join(f.description for f in req.key_formulas)}"
        if req.key_formulas
        else ""
    )

    prompt = f"""You are Athena, a warm and encouraging AI tutor. A student just completed a {req.lesson_type} on "{req.subtopic_name}" (part of {req.topic_name}).{score_context}{objectives_context}{formulas_context}

Generate a short, personal congratulatory message as JSON with these fields:
- greeting: a short celebratory phrase (3-6 words), e.g. "You did it!" or "Nicely done!"
- summary: 1-2 sentences about what they learned today, referencing the topic specifically. Address the student as "you".
- takeaways: an array of 2-3 concise bullet points of key concepts they covered
- encouragement: a single motivational closing line

If a score was provided, reference it naturally. Keep total text under 100 words. Be warm but not over-the-top.

Respond with ONLY valid JSON, no markdown fences."""

    client = anthropic_client(feature="lesson-summary", metadata=_md_headers(req.request_metadata))
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )

    try:
        result = json.loads(message.content[0].text)
        return result
    except (json.JSONDecodeError, IndexError) as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response: {e}")


class ReportAnalyzeRequest(BaseModel):
    """Request body for the PDF-report analysis endpoint.

    `kind` is "quiz" or "micro-lesson". `aggregates` is the shape
    defined in src/lib/reports/types.ts — QuizAggregates or
    MicroLessonAggregates. `snapshot` is only present for the
    micro-lesson variant (carries chat transcript + per-step
    attempts that aren't persisted to Supabase).
    """

    kind: str
    aggregates: dict
    snapshot: dict | None = None
    request_metadata: RequestMetadata = RequestMetadata()


@app.post("/reports/analyze")
async def reports_analyze_endpoint(req: ReportAnalyzeRequest):
    if req.kind not in ("quiz", "micro-lesson"):
        raise HTTPException(status_code=400, detail="Unknown report kind")
    try:
        result = analyze_report(
            kind=req.kind,
            aggregates=req.aggregates,
            snapshot=req.snapshot,
            headers=_md_headers(req.request_metadata),
        )
        return result
    except Exception as e:
        print(f"[reports/analyze] error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class AnswerMatchRequest(BaseModel):
    transcript: str
    options: list[str]
    question: str | None = ""


@app.post("/answer-match")
async def answer_match_endpoint(req: AnswerMatchRequest):
    """Decide which multiple-choice option (if any) a voice transcript
    is selecting. Used by the lesson's voice dispatch when the
    client-side regex couldn't match. Returns {"index": int} where
    index is the picked option's zero-based index, or -1 if the
    student didn't pick any (e.g., they asked a clarifying question).
    """
    import anthropic

    if not req.options:
        return {"index": -1}

    options_block = "\n".join(f"[{i}] {opt}" for i, opt in enumerate(req.options))
    prompt = (
        f"A student is answering a multiple-choice question by voice.\n\n"
        f"Question: {req.question or '(unknown)'}\n"
        f"Options:\n{options_block}\n\n"
        f'The student said: "{req.transcript}"\n\n'
        f"Which option are they picking?\n"
        f"- Reply with ONLY a single integer 0..{len(req.options) - 1} on its own line.\n"
        f"- Reply -1 if the response doesn't pick any option (e.g., they asked "
        f"a clarifying question, said something off-topic, or are uncertain).\n"
        f"- Do not explain. Single integer only."
    )

    client = anthropic.Anthropic()
    try:
        message = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=10,
            messages=[{"role": "user", "content": prompt}],
        )
        text = message.content[0].text.strip()
        # Extract first integer in the response (defensive against
        # the model wrapping its answer in quotes/markdown).
        match = __import__("re").search(r"-?\d+", text)
        if not match:
            return {"index": -1}
        idx = int(match.group(0))
        if idx < -1 or idx >= len(req.options):
            return {"index": -1}
        return {"index": idx}
    except Exception as e:
        print(f"[answer-match] error: {e}")
        return {"index": -1}


class ChatSummaryMessage(BaseModel):
    role: str  # "user" | "tutor"
    content: str


class ChatSummaryRequest(BaseModel):
    messages: list[ChatSummaryMessage]
    request_metadata: RequestMetadata = RequestMetadata()


@app.post("/chat-summary")
async def chat_summary_endpoint(req: ChatSummaryRequest):
    """Generate a one-line summary of a tutor chat side-quest. Used by
    the micro-lesson UI to label the collapsible chat-interaction
    divider so the student can recognize what the side-quest covered.
    Runs a fast model so we don't add real latency to the chat flow.
    """
    transcript_lines: list[str] = []
    for m in req.messages:
        speaker = "Student" if m.role == "user" else "Tutor"
        text = " ".join(m.content.split())
        if not text:
            continue
        transcript_lines.append(f"{speaker}: {text}")
    transcript = "\n".join(transcript_lines)
    if not transcript:
        return {"summary": ""}

    prompt = (
        "Summarize this tutor side-quest in 5 to 10 words. Output the "
        "summary only — no quotes, no prefix, no period. Lowercase "
        "except for proper nouns and variables. Examples:\n"
        "  - distributing 3 across (x + 4)\n"
        "  - why subtract before divide\n"
        "  - check if x = 2 satisfies the equation\n\n"
        f"Transcript:\n{transcript}"
    )

    client = anthropic_client(feature="chat-summary", metadata=_md_headers(req.request_metadata))
    try:
        message = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=40,
            messages=[{"role": "user", "content": prompt}],
        )
        text = message.content[0].text.strip().strip('"').strip("'")
        # Cap to ~80 chars defensively in case the model overshoots.
        if len(text) > 80:
            text = text[:77] + "…"
        return {"summary": text}
    except Exception as e:
        print(f"[chat-summary] error: {e}")
        return {"summary": ""}


class HandwritingOcrRequest(BaseModel):
    """Transcribe a hand-drawn equation (PNG) to LaTeX.

    Backs the in-canvas "Draw on the board" input: the client captures
    the student's ink as a black-on-white PNG and POSTs it here; the
    morph target on the board is the typeset LaTeX we return.
    """
    image_base64: str
    image_media_type: str = "image/png"
    request_metadata: RequestMetadata = RequestMetadata()


@app.post("/handwriting-ocr")
async def handwriting_ocr_endpoint(req: HandwritingOcrRequest):
    """Single vision call: handwritten math → one LaTeX expression.

    Returns {"latex": str}. An empty string is the sanctioned
    "couldn't read it" signal — the client treats it as a soft failure
    and offers redraw / send-as-image rather than morphing garbage.
    """
    if not req.image_base64:
        return {"latex": ""}

    client = anthropic_client(
        feature="handwriting-ocr",
        metadata=_md_headers(req.request_metadata),
    )
    try:
        message = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=300,
            temperature=0,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": req.image_media_type,
                                "data": req.image_base64,
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                "You are an OCR transcriber, NOT a math solver. "
                                "Transcribe ONLY the handwriting actually drawn "
                                "in this image to a single LaTeX expression. "
                                "Copy exactly what is written — do not solve, "
                                "complete, correct, or invent anything. Return "
                                "ONLY the LaTeX: no $ delimiters, no prose, no "
                                "code fences, no explanation.\n"
                                "If the image is blank, nearly blank, or you "
                                "are not confident there is real handwritten "
                                "math present, return an empty line (output "
                                "nothing). Never guess."
                            ),
                        },
                    ],
                }
            ],
        )
        import re

        latex = message.content[0].text.strip()
        # Defensive: strip stray delimiters / fences the model may add
        # despite the instruction.
        if latex.startswith("```"):
            latex = latex.strip("`")
            if latex.lower().startswith("latex"):
                latex = latex[5:]
        latex = latex.strip().strip("$").strip()
        # Guard against prose "refusals" (e.g. "I can't read this image…")
        # that a weaker model emits instead of an empty line. Strip LaTeX
        # commands, then if what's left reads like an English sentence
        # (several 3+-letter words), treat it as "couldn't read" → empty.
        # Real transcriptions ("x + 3 = 7", "\frac{1}{2}") have ~none.
        wordy = re.findall(r"[a-zA-Z]{3,}", re.sub(r"\\[a-zA-Z]+", " ", latex))
        if len(wordy) >= 4:
            print(f"[handwriting-ocr] discarding prose-like output: {latex!r}")
            latex = ""
        return {"latex": latex}
    except Exception as e:
        print(f"[handwriting-ocr] error: {e}")
        return {"latex": ""}


class MathEquivRequest(BaseModel):
    """Algebraic-equivalence check for fill_blank student answers.

    `user` is the student's typed input. `candidates` are the
    author-seeded `acceptedAnswers` from the InteractionUnit — we check
    the user against each candidate in turn and return the first
    algebraic match (commutative reordering, distribution, factoring,
    side-swapped equations, etc., all via sympy).

    The TS caller has already tried case-insensitive string equality
    and numeric equivalence (decimal/fraction normalization) before
    reaching this endpoint, so this is the algebra-only path.
    """

    user: str
    candidates: list[str]


class MathEquivResponse(BaseModel):
    equivalent: bool
    matched: str | None = None
    # `unparseable` indicates that either the user input or every
    # candidate failed to parse — the TS caller can treat this as a
    # "mismatch" but might want to log it (a student typing literal
    # English into a math input is the common case here).
    unparseable: bool = False


@app.post("/math-equiv")
async def math_equiv_endpoint(req: MathEquivRequest) -> MathEquivResponse:
    """Reuses `task_equivalence` from `eval_math_shim` — the same
    sympy-backed comparator the offline evaluator uses. It handles
    LaTeX wrappers (htmlClass/textcolor), implicit multiplication
    (`2x`), `^` as exponent, equations (`x = 3` ≡ `3 = x`), inequalities,
    and compound relations (`-1 <= x <= 5`)."""
    if not req.user.strip() or not req.candidates:
        return MathEquivResponse(equivalent=False, unparseable=False)
    user_parsed_ok = False
    for c in req.candidates:
        if not c or not c.strip():
            continue
        result = task_equivalence({"a": req.user, "b": c})
        if result.get("ok") and result.get("checkable"):
            user_parsed_ok = True
            if result.get("equivalent"):
                return MathEquivResponse(equivalent=True, matched=c)
    return MathEquivResponse(equivalent=False, unparseable=not user_parsed_ok)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
