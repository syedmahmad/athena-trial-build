"""
Infographic agent — produces a single 1024x1536 portrait PNG that
visualizes a subtopic: hook, key formulas, common gotchas, a mnemonic,
and a fun fact, in a vibrant magazine-style layout.

Pipeline:
  1. Claude (Sonnet 4.6) authors a structured InfographicBrief covering
     what to put on the poster (text, formulas, gotchas).
  2. The brief is composed into a precise image-generation prompt and
     handed to OpenAI gpt-image-2 at quality=high.

Why two steps? gpt-image-2 renders text well but is bad at deciding what
text BELONGS on the poster. Letting Claude decide content and gpt-image-2
decide style produces far better infographics than a single all-in-one
prompt.

Output is a Pydantic-validated `InfographicBrief` plus a base64-encoded
PNG. The Next.js orchestrator uploads the PNG to Supabase Storage and
persists the brief + image URL to the `infographics` table.
"""

from __future__ import annotations

import base64
import sys
from typing import Optional

from agno.agent import Agent
from pydantic import BaseModel, ConfigDict, Field

from app.utils.llm_client import claude, openai_image_client


# ── Schemas ─────────────────────────────────────────────────────────────


class InfographicFormula(BaseModel):
    """One headline formula or key fact for the infographic."""

    model_config = ConfigDict(extra="forbid")

    label: str = Field(
        ...,
        description=(
            "Plain-English label for this formula (4-8 words). Shown as "
            "a small caption next to the rendered formula. Example: "
            "'Slope of a line'."
        ),
    )
    formula: str = Field(
        ...,
        description=(
            "The formula in plain typed math — NO LaTeX backslashes. Use "
            "Unicode where natural (π, ², ÷, ±, ≥, ≤). Examples: "
            "'m = (y2 − y1) / (x2 − x1)', 'a² + b² = c²', 'E = mc²'. "
            "Keep it short enough to fit in a hand-lettered box on a "
            "poster — under ~30 characters."
        ),
    )


class InfographicGotcha(BaseModel):
    """One 'gotcha' / common mistake worth flagging on the poster."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(
        ...,
        description=(
            "Punchy headline for the gotcha (3-6 words). Examples: "
            "'Sign of the slope', 'Order matters', 'Drop the units'."
        ),
    )
    explanation: str = Field(
        ...,
        description=(
            "One sentence (~15 words) explaining the mistake and the "
            "fix. Plain English, no LaTeX. Will be rendered in a small "
            "warning box on the poster."
        ),
    )


class InfographicBrief(BaseModel):
    """Full content brief for an infographic poster. The image model
    consumes this through a composed prompt, not directly."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(
        ...,
        description=(
            "Big poster title, sentence-case, under 50 chars. Catchy and "
            "concrete. Example: 'How slopes really work' rather than "
            "'Linear functions'."
        ),
    )
    hook: str = Field(
        ...,
        description=(
            "One-sentence hook printed under the title (~12 words). "
            "Frames why this topic matters. Example: 'Every straight "
            "line has one number that tells you everything.'"
        ),
    )
    formulas: list[InfographicFormula] = Field(
        ...,
        description=(
            "3-5 headline formulas or key facts. These are the "
            "FORMULAS-AT-A-GLANCE row of the poster. Pick the ones a "
            "student actually needs on test day."
        ),
        min_length=3,
        max_length=5,
    )
    gotchas: list[InfographicGotcha] = Field(
        ...,
        description=(
            "2-3 'gotchas' — the most common mistakes students make on "
            "this subtopic. Each gets a small warning box on the poster."
        ),
        min_length=2,
        max_length=3,
    )
    mnemonic: Optional[str] = Field(
        default=None,
        description=(
            "Optional memorable mnemonic, acronym, or trick (under 12 "
            "words). Examples: 'PEMDAS', 'SOH CAH TOA', 'Rise over run'. "
            "Set to null if no natural mnemonic fits — do NOT invent a "
            "forced one."
        ),
    )
    fun_fact: str = Field(
        ...,
        description=(
            "One genuinely interesting fact related to the topic that a "
            "curious student would enjoy (~20 words). Historical, "
            "real-world, or counter-intuitive. Avoid generic 'math is "
            "everywhere' filler."
        ),
    )
    color_scheme: str = Field(
        ...,
        description=(
            "Two-or-three-word vibe descriptor for the color palette. "
            "Examples: 'electric blue & coral', 'forest green & cream', "
            "'sunset gradient', 'monochrome cobalt'. Pick something that "
            "fits the topic's feel — bright/energetic for accessible "
            "topics, deeper jewel tones for more abstract topics."
        ),
    )


# ── Instructions ────────────────────────────────────────────────────────


_INFOGRAPHIC_BRIEF_INSTRUCTIONS: list[str] = [
    "You are the creative director for Athena's educational infographic "
    "series. You author the CONTENT brief that a separate image model "
    "renders into a poster. Your output is a single InfographicBrief "
    "object — NOT the image itself.",
    # ── Audience + tone ──
    "AUDIENCE: A high-school student studying for the SAT or learning "
    "the topic for the first time. They want clarity, not jargon. They "
    "want what to remember on test day, not a textbook chapter.",
    "TONE: Engaging and a little playful, but never cutesy or "
    "patronizing. Treat the reader as smart. The poster should feel "
    "like something they'd actually pin on a wall, not a sterile cheat "
    "sheet.",
    # ── Content rules ──
    "FORMULAS: Pick the 3-5 formulas a student would ACTUALLY want at "
    "a glance for this subtopic. If only one formula matters, pad with "
    "key facts in formula-shape (e.g. 'sum of angles = 180°'). Write "
    "them with Unicode, never LaTeX. Use the `formula` field for the "
    "math itself and the `label` field for the plain-English caption.",
    "GOTCHAS: Choose the 2-3 mistakes the user-provided 'common "
    "mistakes' list actually warns about. If that list is empty, use "
    "your knowledge of where students trip on this topic. Frame each "
    "gotcha as a memorable headline + a one-sentence fix.",
    "MNEMONIC: Only include if a natural one exists (SOH CAH TOA, "
    "PEMDAS, FOIL, 'rise over run'). Do NOT invent forced acronyms. "
    "Leave it null otherwise.",
    "FUN FACT: This is the line that makes the poster worth pinning. "
    "Look for historical origin stories, surprising real-world "
    "applications, or counter-intuitive consequences. Skip generic "
    "'math is everywhere' filler.",
    # ── Style + color ──
    "COLOR SCHEME: Pick a vibe that fits the topic's feel. Geometry "
    "and slopes — bright, energetic. Probability and statistics — "
    "deeper jewel tones. Algebra — clean two-color schemes. The image "
    "model will interpret your descriptor literally, so be specific "
    "('electric blue & coral' beats 'colorful').",
    # ── Final check ──
    "FINAL CHECK: (1) title under 50 chars, concrete not abstract. "
    "(2) every formula renders without LaTeX. (3) gotchas address "
    "actual mistakes, not invented ones. (4) fun_fact is genuinely "
    "interesting, not filler. (5) color_scheme is specific.",
]


# Non-SAT audience for general academic subjects (science, social-studies).
_GENERAL_AUDIENCE = (
    "AUDIENCE: A high-school student learning this general academic topic, "
    "possibly for the first time. They want clarity, not jargon, and something "
    "worth pinning on a wall. Do not frame anything around exams or test-taking."
)


# ── Brief factory ───────────────────────────────────────────────────────


def build_infographic_brief_agent(
    *,
    model=None,
    metadata: dict[str, str] | None = None,
    subject: str = "math",
) -> Agent:
    """Build the Claude agent that authors the InfographicBrief.

    For general academic subjects (not math / reading-writing) the SAT audience
    line is swapped for a subject-neutral one so the poster carries no SAT framing.
    """
    instructions = [
        _GENERAL_AUDIENCE
        if (subject not in ("math", "reading-writing") and s.startswith("AUDIENCE:"))
        else s
        for s in _INFOGRAPHIC_BRIEF_INSTRUCTIONS
    ]
    return Agent(
        name="Athena Infographic Director",
        model=model
        or claude(
            id="claude-sonnet-4-6",
            feature="infographic-brief",
            cache_system_prompt=True,
            max_tokens=3000,
            metadata=metadata,
        ),
        description=(
            "You are the creative director for Athena's educational "
            "infographics. Author the content brief; the image is "
            "rendered downstream."
        ),
        instructions=instructions,
        markdown=False,
    )


infographic_brief_agent = build_infographic_brief_agent()


# ── Prompt builders ─────────────────────────────────────────────────────


def _build_brief_user_prompt(
    *,
    topic: str,
    subtopic: str,
    description: str,
    learning_objectives: list[str],
    key_formulas: list[dict],
    common_mistakes: list[dict],
    tips_and_tricks: list[str],
    conceptual_overview: Optional[dict],
) -> str:
    parts: list[str] = []
    parts.append(f"TOPIC: {topic}")
    parts.append(f"SUBTOPIC: {subtopic}")
    if description:
        parts.append(f"\nDESCRIPTION:\n{description}")
    if learning_objectives:
        parts.append("\nLEARNING OBJECTIVES (what the student should walk away with):")
        for obj in learning_objectives:
            parts.append(f"  - {obj}")
    if key_formulas:
        parts.append("\nKEY FORMULAS / FACTS (curate the best 3-5; convert LaTeX to Unicode):")
        for kf in key_formulas:
            latex = kf.get("latex", "")
            desc = kf.get("description", "")
            parts.append(f"  - {latex}  ({desc})" if desc else f"  - {latex}")
    if common_mistakes:
        parts.append("\nCOMMON MISCONCEPTIONS (source for gotchas):")
        for cm in common_mistakes:
            parts.append(
                f"  - Mistake: {cm.get('mistake', '')}\n"
                f"    Why: {cm.get('why', '')}\n"
                f"    Fix: {cm.get('correction', '')}"
            )
    if tips_and_tricks:
        parts.append("\nTIPS & TRICKS the poster could feature:")
        for tip in tips_and_tricks:
            parts.append(f"  - {tip}")
    if conceptual_overview:
        parts.append("\nCONCEPTUAL OVERVIEW (background, not for direct quoting):")
        for k, v in conceptual_overview.items():
            if v:
                parts.append(f"  {k}: {v}")
    parts.append(
        "\nAuthor the InfographicBrief object. Remember the schema and "
        "the rules above — especially: no LaTeX in formulas, no invented "
        "mnemonics, no filler fun facts."
    )
    return "\n".join(parts)


def _build_image_prompt(*, brief: InfographicBrief, subtopic: str) -> str:
    """Compose the gpt-image-2 prompt from the structured brief.

    gpt-image-2 reads detailed, declarative prompts well. We hand it:
      - exact text to render (verbatim, in quotes)
      - structural layout (rows, boxes, where things go)
      - style direction (modern magazine-style, hand-lettered accents)
      - the color scheme the brief picked
    """
    lines: list[str] = []
    lines.append(
        "A vibrant educational infographic poster, portrait orientation, "
        "modern magazine-style layout. Designed to be both engaging and "
        "informative — the kind of poster a student would pin to their "
        "wall."
    )
    lines.append("")
    lines.append(f"COLOR PALETTE: {brief.color_scheme}.")
    lines.append("")
    lines.append(
        "STYLE: Clean editorial layout with a mix of bold sans-serif "
        "headings, hand-lettered accents, and crisp line illustrations. "
        "Slightly off-white paper texture in the background. Use boxes, "
        "rules, and arrows to organize sections. Add small playful "
        "doodles or icons relevant to the topic where there is empty "
        "space — no stock-art clip-art."
    )
    lines.append("")
    lines.append(f'TOPIC: {subtopic}')
    lines.append("")
    lines.append("TEXT TO RENDER (use these exact words, spelled correctly):")
    lines.append(f'• Title (largest, top of poster): "{brief.title}"')
    lines.append(f'• Hook (under the title, smaller): "{brief.hook}"')
    lines.append("")
    lines.append("• FORMULAS section (a row or grid of small framed boxes, mid-poster):")
    for f in brief.formulas:
        lines.append(f'    – box labeled "{f.label}" containing the formula: {f.formula}')
    lines.append("")
    lines.append("• GOTCHAS section (warning-style callout boxes, lower-mid):")
    for g in brief.gotchas:
        lines.append(f'    – "GOTCHA: {g.title}" — "{g.explanation}"')
    lines.append("")
    if brief.mnemonic:
        lines.append(
            f'• MNEMONIC (highlighted ribbon or banner near the bottom): "{brief.mnemonic}"'
        )
        lines.append("")
    lines.append(
        f'• FUN FACT (small footer box, italic-style): "{brief.fun_fact}"'
    )
    lines.append("")
    lines.append(
        "TYPOGRAPHY RULES: Render every quoted phrase above EXACTLY as "
        "written, with correct spelling. Use clear, legible typefaces. "
        "Formulas should be readable from a few feet away. Do not add "
        "any text I did not provide."
    )
    lines.append("")
    lines.append(
        "MOOD: Energetic, educational, a little playful. Not corporate, "
        "not childish."
    )
    return "\n".join(lines)


# ── Render ──────────────────────────────────────────────────────────────


# gpt-image-2 is OpenAI's current flagship image model with reliable
# text rendering. Portrait 1024x1536 gives a poster shape; quality=high
# is required for readable typography in formulas and gotcha boxes.
_IMAGE_MODEL = "gpt-image-2"
_IMAGE_SIZE = "1024x1536"
_IMAGE_QUALITY = "high"


async def generate_infographic(
    *,
    topic: str,
    subtopic: str,
    description: str = "",
    learning_objectives: Optional[list[str]] = None,
    key_formulas: Optional[list[dict]] = None,
    common_mistakes: Optional[list[dict]] = None,
    tips_and_tricks: Optional[list[str]] = None,
    conceptual_overview: Optional[dict] = None,
    brief_agent: Optional[Agent] = None,
    metadata: dict[str, str] | None = None,
) -> tuple[InfographicBrief, bytes]:
    """Generate one infographic.

    Returns (brief, png_bytes). The PNG is decoded from gpt-image-2's
    base64 response. The Next.js orchestrator uploads to Supabase
    Storage and persists.
    """
    # Step 1: Brief via Claude.
    agent_ = brief_agent or infographic_brief_agent
    brief_prompt = _build_brief_user_prompt(
        topic=topic,
        subtopic=subtopic,
        description=description,
        learning_objectives=learning_objectives or [],
        key_formulas=key_formulas or [],
        common_mistakes=common_mistakes or [],
        tips_and_tricks=tips_and_tricks or [],
        conceptual_overview=conceptual_overview,
    )

    brief: Optional[InfographicBrief] = None
    last_repr: str = ""
    for attempt in range(2):
        run_output = await agent_.arun(
            brief_prompt,
            stream=False,
            output_schema=InfographicBrief,
        )
        for attr in ("content", "structured_output", "output"):
            value = getattr(run_output, attr, None)
            if isinstance(value, InfographicBrief):
                brief = value
                break
            if isinstance(value, dict):
                try:
                    brief = InfographicBrief.model_validate(value)
                    break
                except Exception:
                    pass
        if brief is not None:
            break
        last_repr = (
            f"(got {type(run_output).__name__}; "
            f"content type={type(getattr(run_output, 'content', None)).__name__}; "
            f"sample={str(getattr(run_output, 'content', ''))[:200]})"
        )
        sys.stderr.write(
            f"[infographic_agent] brief attempt {attempt + 1} did not "
            f"yield a parsed InfographicBrief; retrying once.\n"
        )

    if brief is None:
        raise RuntimeError(
            f"infographic_agent did not return an InfographicBrief after retry {last_repr}"
        )

    # Step 2: Render via gpt-image-2.
    image_prompt = _build_image_prompt(brief=brief, subtopic=subtopic)
    client = openai_image_client(feature="infographic-render", metadata=metadata)

    try:
        # The OpenAI SDK's `images.generate()` is a sync method — Agno's
        # arun() suspended above, so calling it inline here is fine for a
        # one-shot request. (Total wall time is dominated by the model's
        # 30-60s render anyway.)
        result = client.images.generate(
            model=_IMAGE_MODEL,
            prompt=image_prompt,
            size=_IMAGE_SIZE,
            quality=_IMAGE_QUALITY,
            n=1,
        )
    except Exception as e:
        raise RuntimeError(f"gpt-image-2 render failed: {e}") from e

    if not result.data or not getattr(result.data[0], "b64_json", None):
        raise RuntimeError("gpt-image-2 returned no image data")

    png_bytes = base64.b64decode(result.data[0].b64_json)
    return brief, png_bytes
