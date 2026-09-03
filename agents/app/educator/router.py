"""
Educator surface (/educators in the web app): homework generation,
AI grading, and roster Q&A chat.

Ported from the Lovable "Athena for Teachers" prototype's three Supabase
edge functions (listen / grade-submission / chat). All LLM traffic goes
through the Majordomo gateway via app.utils.llm_client.
"""

from __future__ import annotations

import base64
import io
import json
import sys
import xml.etree.ElementTree as ET
import zipfile
from typing import Any, AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.utils.llm_client import anthropic_async_client, anthropic_client

router = APIRouter()

MODEL = "claude-sonnet-4-6"

# ─── Homework generation (streaming) ─────────────────────────────────────

ANSWER_KEY_MARKER = "=== ANSWER KEY ==="

HOMEWORK_SYSTEM = f"""You are Athena, an assistant that writes K-12 homework assignments for teachers.

Output contract (the app splits your output mechanically — follow it exactly):
- The FIRST LINE is a clear, concise title (no markdown, no quotes, no "Title:" prefix).
- Then a blank line, then the assignment exactly as students should read it.
- If the assignment has determinate answers or the teacher asked for a key or
  rubric, end with a line containing exactly `{ANSWER_KEY_MARKER}` followed by
  the answer key / rubric. Everything before the marker is shown to students;
  everything after it is teacher-only. Never reveal answers before the marker.

Content rules:
- Plain text only: no markdown symbols (#, *, -) and no preamble or commentary for the teacher.
- Use ordinary punctuation (commas, periods, colons, parentheses). Do NOT use em dashes or en dashes; write the way a teacher writes by hand.
- This is digital-first content: do NOT include print-era headers like
  "Name: ____", "Date: ____", or "Period: ____" (the app adds those when a
  teacher prints).
- Match the grade level, subject, style, and problem count the teacher asked for.
- Number questions when there are several.
- The teacher may attach reference files (images, a PDF, or a document — e.g. a
  worksheet to model, a textbook page, or their own notes). When files are
  attached, base the assignment on them: keep the same topic and style, adapt or
  expand as the teacher's notes direct, and transcribe math/diagrams faithfully.
- Whenever the work has determinate answers — especially work derived from an
  attached worksheet — ALWAYS produce the answer key after the marker, so the app
  can grade student submissions against it.
- Keep the tone clear and professional."""

# Word XML namespace for the dependency-free .docx text extractor.
_W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _docx_to_text(data: bytes) -> str:
    """Pull readable text out of a .docx (a zip of XML) using only the stdlib —
    no python-docx/lxml dependency. Joins each paragraph's <w:t> runs, one line
    per paragraph. Returns "" on any malformed input."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            xml = zf.read("word/document.xml")
        root = ET.fromstring(xml)
        lines = [
            "".join(t.text or "" for t in para.iter(f"{_W_NS}t")).strip()
            for para in root.iter(f"{_W_NS}p")
        ]
        return "\n".join(lines).strip()
    except Exception as e:  # noqa: BLE001 — best-effort, never fatal
        print(f"[educator-homework] .docx extract failed: {e}", file=sys.stderr)
        return ""


def _decode_text_attachment(att: "HomeworkAttachment") -> str:
    """A 'text' attachment's bytes → readable text: .docx via the zip extractor,
    anything else (txt/md) as UTF-8."""
    try:
        raw = base64.b64decode(att.data)
    except Exception:
        return ""
    is_docx = (att.media_type or "").endswith("wordprocessingml.document") or (
        att.name or ""
    ).lower().endswith(".docx")
    if is_docx:
        return _docx_to_text(raw)
    return raw.decode("utf-8", errors="replace").strip()


class HomeworkAttachment(BaseModel):
    # "image" → vision block, "pdf" → document block, "text" → inlined (docx/txt).
    kind: str
    name: str = ""
    media_type: str = ""
    data: str = ""  # base64, no data: prefix


class HomeworkRequest(BaseModel):
    prompt: str = ""
    attachments: list[HomeworkAttachment] = Field(default_factory=list)


def _extract_attachment_content(
    attachments: list[HomeworkAttachment],
) -> tuple[list[dict[str, Any]], list[str]]:
    """Split teacher attachments into Claude media blocks (images → vision,
    PDFs → document) and inlined text sections (.docx/.txt). Shared by the
    prose-stream and structured-quiz generators."""
    media_blocks: list[dict[str, Any]] = []
    doc_sections: list[str] = []
    for att in attachments:
        if not att.data and att.kind != "text":
            continue
        if att.kind == "image":
            media_blocks.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": att.media_type or "image/jpeg",
                        "data": att.data,
                    },
                }
            )
        elif att.kind == "pdf":
            media_blocks.append(
                {
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": att.data,
                    },
                }
            )
        elif att.kind == "text":
            text = _decode_text_attachment(att)
            if text:
                label = att.name or "attached document"
                doc_sections.append(f"--- Contents of {label} ---\n{text}")
    return media_blocks, doc_sections


@router.post("/homework/stream")
async def homework_stream(req: HomeworkRequest):
    """SSE stream of a generated homework assignment.

    The teacher's typed notes and any attached files (images/PDF as native
    Claude blocks, .docx/text inlined) both feed generation. Output contract:
    title line, blank line, student content, then an optional teacher-only
    answer key after ANSWER_KEY_MARKER.
    """

    instruction = (req.prompt or "").strip()
    media_blocks, doc_sections = _extract_attachment_content(req.attachments)
    has_files = bool(media_blocks or doc_sections)
    parts: list[str] = []
    if instruction:
        parts.append(
            f"Create a homework assignment based on this request:\n\n{instruction}"
        )
    elif has_files:
        parts.append(
            "Create a homework assignment based on the attached file(s). Use them as "
            "the source material — keep the topic, style, and difficulty consistent "
            "with what they contain."
        )
    else:
        parts.append("Create a homework assignment.")
    if doc_sections:
        parts.append("\n\n".join(doc_sections))
    if media_blocks:
        parts.append(
            "The attached image(s) / PDF(s) above are the teacher's reference "
            "material; base the assignment on them."
        )
    user_text = "\n\n".join(parts)

    content: list[dict[str, Any]] | str
    if media_blocks:
        content = [*media_blocks, {"type": "text", "text": user_text}]
    else:
        content = user_text

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            client = anthropic_async_client(feature="educator-homework")
            async with client.messages.stream(
                model=MODEL,
                max_tokens=4096,
                system=HOMEWORK_SYSTEM,
                messages=[{"role": "user", "content": content}],
            ) as stream:
                async for text in stream.text_stream:
                    yield f"data: {json.dumps({'token': text})}\n\n"
        except Exception as e:  # surfaced to the client as a toast
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


# ─── Homework as a structured quiz (per-question) ────────────────────────

QUIZ_SYSTEM = """You are Athena, writing a K-12 homework assignment for a teacher as a set of answerable questions that students complete online, one question at a time.

Produce a quiz/worksheet the student works through question by question:
- A short, clear title (no "Title:" prefix, no markdown, no quotes).
- Brief directions (1-2 sentences) shown above the questions.
- A list of questions. Each question is self-contained and answerable by typing a short answer or showing work — the student answers each one in its own box (or uploads a photo of handwritten work). For EVERY question also give the correct answer / worked solution / acceptance criteria; this is teacher-only, used to grade, and never shown to the student.

Rules:
- Match the grade level, subject, style, and number of questions the teacher asked for. If the count is unspecified, choose a sensible one (4-8).
- Plain text only (no markdown symbols). Keep math readable, e.g. 2x + 3 = 11.
- Use ordinary punctuation (commas, periods, colons, parentheses). Do NOT use em dashes or en dashes.
- Do NOT include print-era headers (Name/Date/Period) — those are added at print time.
- If the teacher attached files (a worksheet, textbook page, or their notes), base the questions on them: mirror the topic and style and transcribe math/diagrams faithfully.
- Always provide an answer for every question so the work can be graded.
Use the homework_quiz tool."""

QUIZ_TOOL = {
    "name": "homework_quiz",
    "description": "Return the homework as a structured set of questions with teacher-only answers.",
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "intro": {
                "type": "string",
                "description": "1-2 sentence directions shown above the questions.",
            },
            "questions": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "object",
                    "properties": {
                        "prompt": {
                            "type": "string",
                            "description": "The question as the student reads it.",
                        },
                        "answer": {
                            "type": "string",
                            "description": "Correct answer / worked solution / rubric. Teacher-only — never shown to students.",
                        },
                    },
                    "required": ["prompt", "answer"],
                },
            },
        },
        "required": ["title", "intro", "questions"],
    },
}


class QuizQuestion(BaseModel):
    prompt: str
    answer: str = ""


class QuizResponse(BaseModel):
    title: str
    intro: str
    questions: list[QuizQuestion]


@router.post("/homework/quiz", response_model=QuizResponse)
def homework_quiz(req: HomeworkRequest) -> QuizResponse:
    """Generate homework as a structured per-question quiz: a title, short
    directions, and questions each carrying a teacher-only answer. Same
    attachment vision as the streaming generator; returns JSON via tool-use."""

    instruction = (req.prompt or "").strip()
    media_blocks, doc_sections = _extract_attachment_content(req.attachments)
    has_files = bool(media_blocks or doc_sections)

    parts: list[str] = []
    if instruction:
        parts.append(
            f"Create the homework as a set of questions based on this request:\n\n{instruction}"
        )
    elif has_files:
        parts.append(
            "Create the homework as a set of questions based on the attached file(s) — "
            "mirror their topic, style, and difficulty."
        )
    else:
        parts.append("Create a homework assignment as a set of questions.")
    if doc_sections:
        parts.append("\n\n".join(doc_sections))
    if media_blocks:
        parts.append(
            "The attached image(s) / PDF(s) above are the teacher's reference "
            "material; base the questions on them."
        )
    user_text = "\n\n".join(parts)
    content: list[dict[str, Any]] | str = (
        [*media_blocks, {"type": "text", "text": user_text}]
        if media_blocks
        else user_text
    )

    client = anthropic_client(feature="educator-homework-quiz")
    message = client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=QUIZ_SYSTEM,
        messages=[{"role": "user", "content": content}],
        tools=[QUIZ_TOOL],
        tool_choice={"type": "tool", "name": "homework_quiz"},
    )

    parsed: dict[str, Any] = {}
    for block in message.content:
        if block.type == "tool_use" and block.name == "homework_quiz":
            parsed = dict(block.input) if isinstance(block.input, dict) else {}
            break

    questions: list[QuizQuestion] = []
    for q in parsed.get("questions") or []:
        if not isinstance(q, dict):
            continue
        prompt = str(q.get("prompt") or "").strip()
        if not prompt:
            continue
        questions.append(
            QuizQuestion(prompt=prompt, answer=str(q.get("answer") or "").strip())
        )
    if not questions:
        raise HTTPException(status_code=502, detail="quiz generation produced no questions")

    return QuizResponse(
        title=str(parsed.get("title") or "Homework").strip(),
        intro=str(parsed.get("intro") or "").strip(),
        questions=questions,
    )


# ─── Grading (structured) ────────────────────────────────────────────────

GRADE_SYSTEM = """You are an experienced K-12 teacher grading homework.

You will receive an assignment (title + instructions) and a student's response.
The response may be typed text, photos of handwritten work on paper, or both —
read photos carefully (work shown, crossed-out attempts, margins) and grade
what is actually written. When a teacher answer key is provided it is
authoritative: check every answer against it and do not mark wrong answers as
correct, however neat the work. Verify arithmetic yourself when there is no
key. If the student response is exactly [SIMULATE], this is an explicit demo
request: invent a realistic plausible student response (mixed quality is
fine), then grade it. Otherwise grade exactly what the student wrote — never
invent or embellish their work.

Use the grade_submission tool. Be fair, brief, and concrete. Write feedback in plain sentences with ordinary punctuation; never use em dashes.
- grade: integer 0-100
- feedback: 1-2 short sentences, supportive and specific
- response: the student's answer (the one you graded; for photo work, a short transcription of what they wrote; for [SIMULATE], your invented one)"""

GRADE_TOOL = {
    "name": "grade_submission",
    "description": "Return the graded submission.",
    "input_schema": {
        "type": "object",
        "properties": {
            "response": {
                "type": "string",
                "description": "The student response that was graded.",
            },
            "grade": {"type": "integer", "minimum": 0, "maximum": 100},
            "feedback": {"type": "string"},
        },
        "required": ["response", "grade", "feedback"],
    },
}


class GradeImage(BaseModel):
    media_type: str
    data: str  # base64, no data: prefix


class GradeRequest(BaseModel):
    title: str
    instructions: str
    # Teacher-only key; authoritative when present.
    answer_key: str | None = None
    student_name: str | None = None
    student_response: str | None = None
    # Photos of handwritten work (share-link submissions) for vision grading.
    images: list[GradeImage] = Field(default_factory=list)
    # Explicit opt-in: invent a plausible response before grading (demo only).
    # Empty work without this flag is an error, never a silent simulation.
    simulate: bool = False


class GradeResponse(BaseModel):
    response: str
    grade: int | None
    feedback: str


@router.post("/grade", response_model=GradeResponse)
def grade_submission(req: GradeRequest) -> GradeResponse:
    """Grade a real student submission, or simulate-then-grade when asked."""

    real_response = (req.student_response or "").strip()
    if not real_response and not req.images and not req.simulate:
        raise HTTPException(
            status_code=422,
            detail="student_response or images required unless simulate=true",
        )

    if real_response:
        response_note = real_response
    elif req.images:
        response_note = "(see attached photos of the student's written work)"
    else:
        response_note = "[SIMULATE]"
    key_note = (
        f"\n\nTeacher answer key (authoritative — never shown to students):\n{req.answer_key.strip()}"
        if req.answer_key and req.answer_key.strip()
        else ""
    )
    user_msg = (
        f"Assignment title: {req.title}\n\n"
        f"Instructions:\n{req.instructions}{key_note}\n\n"
        f"Student: {req.student_name or 'Student'}\n"
        f"Student response:\n{response_note}"
    )

    content: list[dict[str, Any]] | str
    if req.images:
        content = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": img.media_type,
                    "data": img.data,
                },
            }
            for img in req.images
        ]
        content.append({"type": "text", "text": user_msg})
    else:
        content = user_msg

    client = anthropic_client(feature="educator-grade")
    message = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=GRADE_SYSTEM,
        messages=[{"role": "user", "content": content}],
        tools=[GRADE_TOOL],
        tool_choice={"type": "tool", "name": "grade_submission"},
    )

    parsed: dict[str, Any] = {}
    for block in message.content:
        if block.type == "tool_use" and block.name == "grade_submission":
            parsed = dict(block.input) if isinstance(block.input, dict) else {}
            break

    grade = parsed.get("grade")
    return GradeResponse(
        response=str(parsed.get("response") or ""),
        grade=int(round(grade)) if isinstance(grade, (int, float)) else None,
        feedback=str(parsed.get("feedback") or ""),
    )


# ─── Parent report (structured) ──────────────────────────────────────────

REPORT_SYSTEM = """You write short progress notes from a teacher to a student's parent.

Rules:
- 3-5 sentences, plain text, no markdown, no greeting or sign-off (the app adds those).
- Ordinary punctuation only (commas, periods); never use em dashes.
- Warm and concrete: name specific assignments and what they show about the
  student's progress. Mention the average naturally, not as a data dump.
- Honest: if something needs work, say it kindly with one practical suggestion.
- Never invent assignments, grades, or behavior that isn't in the data.
- If there is no graded work, say there's nothing graded yet this period and
  what's coming up."""


class ReportAssignment(BaseModel):
    title: str
    grade: int | None
    feedback: str | None = None
    turned_in: bool


class ParentReportRequest(BaseModel):
    student_name: str
    period_start: str
    period_end: str
    assignments: list[ReportAssignment] = Field(default_factory=list)


class ParentReportResponse(BaseModel):
    summary: str


@router.post("/parent-report", response_model=ParentReportResponse)
def parent_report(req: ParentReportRequest) -> ParentReportResponse:
    """Warm, grounded parent summary of one student's period."""

    user_msg = (
        f"Student: {req.student_name}\n"
        f"Period: {req.period_start} to {req.period_end}\n"
        f"Graded work this period (JSON):\n"
        f"{json.dumps([a.model_dump() for a in req.assignments], indent=2)}"
    )
    client = anthropic_client(feature="educator-parent-report")
    message = client.messages.create(
        model=MODEL,
        max_tokens=400,
        system=REPORT_SYSTEM,
        messages=[{"role": "user", "content": user_msg}],
    )
    text = "".join(
        block.text for block in message.content if block.type == "text"
    ).strip()
    if not text:
        raise HTTPException(status_code=502, detail="empty report")
    return ParentReportResponse(summary=text)


# ─── Assignment insight (structured) ─────────────────────────────────────

INSIGHT_SYSTEM = """You are an experienced teacher reviewing how a whole class did on ONE assignment.

You get the assignment, the grade distribution, and (per question for practice
sets, or sampled responses for written work) what students actually did. Infer
the SPECIFIC concepts or skills the class struggled with — not generic advice.

Use the class_insight tool:
- headline: one sentence on how the class did overall (name the average).
- struggles: 1-4 short, specific bullets on what tripped students up (cite the
  question or concept, e.g. "Q4 — most chose B, mixing up area and perimeter").
  Empty array if the class did uniformly well.
- suggestion: one concrete next step the teacher could take (a re-teach focus, a
  warm-up, a small-group target).
Ground everything in the data. Never invent struggles that aren't supported."""

INSIGHT_TOOL = {
    "name": "class_insight",
    "description": "Return the class-level insight for this assignment.",
    "input_schema": {
        "type": "object",
        "properties": {
            "headline": {"type": "string"},
            "struggles": {
                "type": "array",
                "items": {"type": "string"},
                "maxItems": 4,
            },
            "suggestion": {"type": "string"},
        },
        "required": ["headline", "struggles", "suggestion"],
    },
}


class InsightRequest(BaseModel):
    title: str
    instructions: str
    answer_key: str | None = None
    is_practice: bool = False
    # Aggregates assembled server-side from real (non-simulated) submissions.
    grade_stats: dict[str, Any] = Field(default_factory=dict)
    question_stats: list[dict[str, Any]] = Field(default_factory=list)
    responses: list[dict[str, Any]] = Field(default_factory=list)


class InsightResponse(BaseModel):
    headline: str
    struggles: list[str]
    suggestion: str


@router.post("/assignment-insight", response_model=InsightResponse)
def assignment_insight(req: InsightRequest) -> InsightResponse:
    """Class-level read on one assignment: what students struggled with."""

    key_note = (
        f"\n\nAnswer key:\n{req.answer_key.strip()}"
        if req.answer_key and req.answer_key.strip()
        else ""
    )
    detail = (
        f"Per-question results (JSON):\n{json.dumps(req.question_stats, indent=2)}"
        if req.is_practice
        else f"Sampled graded responses (JSON):\n{json.dumps(req.responses, indent=2)}"
    )
    user_msg = (
        f"Assignment: {req.title}\n"
        f"Instructions:\n{req.instructions}{key_note}\n\n"
        f"Grade distribution (JSON): {json.dumps(req.grade_stats)}\n\n"
        f"{detail}"
    )

    client = anthropic_client(feature="educator-insight")
    message = client.messages.create(
        model=MODEL,
        max_tokens=700,
        system=INSIGHT_SYSTEM,
        messages=[{"role": "user", "content": user_msg}],
        tools=[INSIGHT_TOOL],
        tool_choice={"type": "tool", "name": "class_insight"},
    )
    parsed: dict[str, Any] = {}
    for block in message.content:
        if block.type == "tool_use" and block.name == "class_insight":
            parsed = dict(block.input) if isinstance(block.input, dict) else {}
            break
    struggles = parsed.get("struggles") or []
    return InsightResponse(
        headline=str(parsed.get("headline") or ""),
        struggles=[str(s) for s in struggles if str(s).strip()][:4],
        suggestion=str(parsed.get("suggestion") or ""),
    )


# ─── Roster chat (streaming) ─────────────────────────────────────────────

CHAT_SYSTEM_TEMPLATE = """You are Athena, a calm, concise teaching assistant. The teacher is asking questions about their students' performance data.

Use ONLY the data provided below to answer. If the data does not contain the answer, say so briefly. Keep answers short, plain text, no markdown symbols. Use names when relevant.

STUDENT DATA (JSON):
{context}"""


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    context: dict[str, Any] = Field(default_factory=dict)


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """SSE stream answering teacher questions about roster performance."""

    system_prompt = CHAT_SYSTEM_TEMPLATE.format(
        context=json.dumps(req.context, indent=2)
    )
    messages = [
        {"role": "assistant" if m.role == "assistant" else "user", "content": m.content}
        for m in req.messages
        if m.content.strip()
    ]

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            client = anthropic_async_client(feature="educator-chat")
            async with client.messages.stream(
                model=MODEL,
                max_tokens=1024,
                system=system_prompt,
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    yield f"data: {json.dumps({'token': text})}\n\n"
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
