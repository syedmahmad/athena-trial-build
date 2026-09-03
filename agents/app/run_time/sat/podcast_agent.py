"""
Podcast script agent — produces a structured conversational script
voiced by a fixed brand cast (one male host, one female host) with an
optional third guest. The script's `speakers` list and `lines` array
are the contract with the Next.js TTS layer: every line carries an
explicit `speaker_id`, so speaker identity is structural (not parsed
from prose).

Output is one-shot Pydantic-validated structured output (Agno tool-use).
No streaming at the LLM level — the whole script lands at once and the
Next.js orchestrator persists it.
"""

from __future__ import annotations

import sys
from typing import Literal, Optional

from agno.agent import Agent
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.utils.llm_client import claude


# ── Brand cast (mirrors src/lib/podcast-voices.ts) ──────────────────────
#
# These names are baked into the prompt so the agent's `speakers` list
# matches what the renderer will use. The renderer ultimately controls
# which ElevenLabs voice plays each `speaker_id`; the agent's job is to
# author dialogue that addresses the hosts by name naturally.

BRAND_HOST_MALE_NAME = "Marcus"
BRAND_HOST_FEMALE_NAME = "Lila"


# ── Schemas ─────────────────────────────────────────────────────────────


class PodcastSpeaker(BaseModel):
    """One speaker in the podcast cast. The `id` field is the load-bearing
    structural anchor; `name` is what the audience hears."""

    model_config = ConfigDict(extra="forbid")

    id: Literal["host_male", "host_female", "guest"] = Field(
        ...,
        description=(
            "Speaker role. Every podcast MUST include host_male and "
            "host_female. A guest is optional — include only when the "
            "topic benefits from a third voice (a specific story, a "
            "domain expert framing, a personal anecdote)."
        ),
    )
    name: str = Field(
        ...,
        description=(
            f"Display name. For host_male use exactly '{BRAND_HOST_MALE_NAME}'. "
            f"For host_female use exactly '{BRAND_HOST_FEMALE_NAME}'. "
            "For a guest, invent a fitting first name (e.g. 'Dr. Ada' for "
            "a math historian)."
        ),
    )
    role: Literal["host", "guest"] = Field(
        ..., description="'host' for the two fixed hosts; 'guest' for the optional third."
    )
    bio: Optional[str] = Field(
        default=None,
        description=(
            "One-line bio. Set for guests only (e.g. 'physics teacher at "
            "Cornell'). Leave null for hosts."
        ),
    )


class DialogueLine(BaseModel):
    """One spoken line. The TTS layer picks the voice from `speaker_id`."""

    model_config = ConfigDict(extra="forbid")

    speaker_id: Literal["host_male", "host_female", "guest"] = Field(
        ...,
        description=(
            "MUST reference a speaker in the cast's `speakers` list. If "
            "`has_guest` is false, only host_male / host_female are valid."
        ),
    )
    text: str = Field(
        ...,
        description=(
            "What this speaker says. TTS-friendly plain English. "
            "NO LaTeX, NO markdown, NO em-dashes (use commas / semicolons / "
            "rephrase). Spell out symbols: 'x squared' not 'x²', 'pi' not "
            "'π'. Numbers under 10 can be written as words. "
            "AUDIO TAGS supported inline (parsed by the TTS model): "
            "[Excited], [Calm], [Curious], [Confident], [Soft], "
            "[Whispering], [Questioning], [Thoughtful], [Warm], "
            "[Sarcastic], [Surprised]. Place a tag immediately before the "
            "sentence it modifies, e.g. '[Excited] That changes everything!' "
            "Use SPARINGLY — a 10-minute episode should have 5-15 tags "
            "total, not one per line, and never two in a row. Avoid "
            "sound-effect tags like [Laughing] / [Coughing] / [Whistling] "
            "in this educational format."
        ),
    )
    tone_hint: Optional[
        Literal["neutral", "excited", "thoughtful", "warm", "curious"]
    ] = Field(
        default=None,
        description=(
            "Advisory tone for this line. Not used by ElevenLabs in v1 — "
            "captured for future use and for human readers of the script."
        ),
    )


class PodcastScript(BaseModel):
    """Full structured podcast script. The agent emits exactly one of these."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(
        ...,
        description=(
            "Episode title, sentence case, under 80 chars. Conversational, "
            "not academic. e.g. 'Why slopes lie to you' rather than "
            "'A Comprehensive Overview of Linear Functions'."
        ),
    )
    summary: str = Field(
        ...,
        description=(
            "Two sentences. What the episode is about and what the "
            "listener walks away knowing. Shown above the player."
        ),
    )
    speakers: list[PodcastSpeaker] = Field(
        ...,
        description=(
            "2 or 3 entries. MUST include exactly one host_male AND one "
            "host_female. If has_guest is true, add one guest entry."
        ),
    )
    has_guest: bool = Field(
        ...,
        description=(
            "True if the script benefits from a third voice for a "
            "specific story or expert framing. Default to false unless "
            "the topic genuinely opens up with a guest perspective."
        ),
    )
    lines: list[DialogueLine] = Field(
        ...,
        description=(
            "The full dialogue, in order. Open with a brief welcome "
            "(host_female and host_male trading a setup), build through "
            "the topic conversationally with the hosts asking each other "
            "questions and offering examples, optionally feature the "
            "guest for one segment, and close with a short outro that "
            "names ONE concrete thing the listener should remember. "
            "Aim for natural turn-taking — neither host monologues for "
            "more than ~3 lines in a row."
        ),
    )
    estimated_duration_minutes: float = Field(
        ...,
        description=(
            "Your own estimate of total spoken duration in minutes. "
            "Roughly 130 words per minute. Not load-bearing — used for "
            "UI hints. Decide length based on topic depth: simple topics "
            "5-8 min, richer topics 10-15 min."
        ),
    )

    @model_validator(mode="after")
    def _normalize(self) -> "PodcastScript":
        """Synthesize rather than raise, so Agno's retry budget isn't
        burned on recoverable schema issues.

        - If a host role is missing, fall back to the brand cast name.
        - If has_guest is False but a DialogueLine references 'guest',
          drop that line (and log).
        - If a DialogueLine references a speaker_id that isn't in
          `speakers`, drop it.
        """
        ids_present = {s.id for s in self.speakers}

        if "host_male" not in ids_present:
            self.speakers.append(
                PodcastSpeaker(
                    id="host_male", name=BRAND_HOST_MALE_NAME, role="host"
                )
            )
            sys.stderr.write("[podcast_agent] synthesized missing host_male speaker\n")
            ids_present.add("host_male")

        if "host_female" not in ids_present:
            self.speakers.append(
                PodcastSpeaker(
                    id="host_female", name=BRAND_HOST_FEMALE_NAME, role="host"
                )
            )
            sys.stderr.write("[podcast_agent] synthesized missing host_female speaker\n")
            ids_present.add("host_female")

        has_guest_in_cast = "guest" in ids_present
        if self.has_guest and not has_guest_in_cast:
            self.has_guest = False

        valid_ids = ids_present if self.has_guest else (ids_present - {"guest"})
        cleaned: list[DialogueLine] = []
        dropped = 0
        for line in self.lines:
            if line.speaker_id in valid_ids:
                cleaned.append(line)
            else:
                dropped += 1
        if dropped:
            sys.stderr.write(
                f"[podcast_agent] dropped {dropped} line(s) with dangling speaker_id\n"
            )
        self.lines = cleaned

        return self


# ── Instructions ────────────────────────────────────────────────────────


_PODCAST_INSTRUCTIONS: list[str] = [
    "You are the producer-writer for Athena's educational podcast. You "
    "author conversational scripts that two regular hosts — "
    f"{BRAND_HOST_MALE_NAME} (male) and {BRAND_HOST_FEMALE_NAME} (female) "
    "— perform together. Optionally a third voice joins as a guest.",
    # ── Format contract ──
    "OUTPUT FORMAT: You return a single PodcastScript object via "
    "structured output. The schema is the contract — read every field "
    "description carefully. Speaker identity is structural: every line "
    "carries a speaker_id that maps to a voice. Never name speakers "
    "inline in the `text` of a line ('Hey Marcus,') without that line "
    "actually being spoken by the OTHER host.",
    # ── Cast rules ──
    f"CAST: ALWAYS include host_male (name: '{BRAND_HOST_MALE_NAME}') "
    f"and host_female (name: '{BRAND_HOST_FEMALE_NAME}'). Use those "
    "exact names. They are recurring hosts the audience already knows; "
    "do not invent backstory for them or have them introduce themselves.",
    "GUEST DECISION: Add a guest only when the topic genuinely opens up "
    "with a third perspective — a specific historical anecdote, a "
    "professional's daily experience, a counter-intuitive expert "
    "framing. Default to no guest. When you do include one, give them "
    "one focused segment (3-6 lines) framed by the hosts on both sides, "
    "not scattered throughout.",
    # ── Tone ──
    "TONE: Friendly, curious, a little playful. The hosts treat the "
    "listener as smart. No condescension, no patronizing 'great "
    "question!' or 'you got this!'. No gratuitous exclamation marks. "
    "Hosts may gently disagree, ask each other for clarification, or "
    "admit when something is unintuitive. That tension is what makes "
    "the format work.",
    # ── Structure ──
    "STRUCTURE: Open with a quick hook (~2-4 lines): one host poses an "
    "interesting question or observation, the other reacts. Then move "
    "into the topic with natural back-and-forth — neither host should "
    "monologue for more than 3 consecutive lines. Use concrete examples "
    "(real numbers, real situations) rather than abstract phrasing. "
    "Close with a short outro that names ONE specific thing the listener "
    "should remember, not a generic 'thanks for listening'.",
    # ── TTS rules ──
    "TTS RULES (the line.text field will be sent to ElevenLabs):\n"
    "  - NO LaTeX, NO $, NO backslashes.\n"
    "  - NO em-dashes. Use commas, semicolons, periods, or rephrase.\n"
    "  - NO markdown, NO bullet points, NO asterisks for emphasis.\n"
    "  - Spell symbols out: 'x squared', 'pi', 'theta', 'three over four'.\n"
    "  - AUDIO TAGS for inflection are encouraged but used sparingly. "
    "Place tags immediately before the sentence they modify, e.g. "
    "'[Excited] That changes everything!' or '[Soft] Honestly, I had to "
    "look that one up.' Valid tags: [Excited], [Calm], [Curious], "
    "[Confident], [Soft], [Whispering], [Questioning], [Thoughtful], "
    "[Warm], [Sarcastic], [Surprised]. Aim for 5-15 tags in a full "
    "episode, NOT one per line. Avoid sound-effect tags ([Laughing], "
    "[Coughing], [Whistling], [Singing]) — out of register here.\n"
    "  - Numbers: under 10 prefer words ('three'); over 10 either form fine.\n"
    "  - Read every line out loud in your head. If it sounds like prose "
    "    from a textbook, rewrite it conversationally.",
    # ── Content ──
    "CONTENT: This is an educational podcast, not entertainment. The "
    "listener should come away with a clearer mental model than they "
    "started with. Ground abstract ideas in concrete examples. Surface "
    "common misconceptions and address them directly. If the topic has "
    "a real-world or historical angle, use it — but don't strain to "
    "manufacture one.",
    "LENGTH: Decide based on topic depth. Simple topics 5-8 minutes "
    "(roughly 650-1000 words). Richer topics 10-15 minutes (1300-1900 "
    "words). Set estimated_duration_minutes honestly based on word "
    "count divided by 130 words per minute.",
    "FINAL CHECK before returning: (1) host_male and host_female both "
    f"present with names '{BRAND_HOST_MALE_NAME}' and "
    f"'{BRAND_HOST_FEMALE_NAME}'. (2) every line's speaker_id is in the "
    "cast. (3) no em-dashes anywhere in any line.text. (4) no "
    "consecutive lines from the same speaker beyond 3 in a row.",
]


# ── Factory ─────────────────────────────────────────────────────────────


def build_podcast_agent(
    *,
    model=None,
    metadata: dict[str, str] | None = None,
) -> Agent:
    """Build a podcast-script agent.

    max_tokens=12000: a richer 15-min podcast at ~150 lines of dialogue
    with summary, speakers list, and per-line metadata can approach the
    8K default. 12K leaves headroom without inflating cost for the
    common 5-8 min case.
    """
    return Agent(
        name="Athena Podcast Producer",
        model=model
        or claude(
            id="claude-sonnet-4-6",
            feature="podcast-script",
            cache_system_prompt=True,
            max_tokens=12000,
            metadata=metadata,
        ),
        description=(
            "You are the producer-writer for Athena's educational "
            "podcast. Two recurring hosts converse about an educational "
            "topic; you author their script."
        ),
        instructions=_PODCAST_INSTRUCTIONS,
        markdown=True,
    )


podcast_agent = build_podcast_agent()


# ── Generator ───────────────────────────────────────────────────────────


def _build_podcast_prompt(
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
    """Build the user-turn prompt with the lesson context. Mirrors the
    shape passed to micro_lesson, but tuned for conversational output."""
    parts: list[str] = []
    parts.append(f"TOPIC: {topic}")
    parts.append(f"SUBTOPIC: {subtopic}")
    if description:
        parts.append(f"\nDESCRIPTION:\n{description}")
    if learning_objectives:
        parts.append("\nLEARNING OBJECTIVES (what the listener should walk away with):")
        for obj in learning_objectives:
            parts.append(f"  - {obj}")
    if key_formulas:
        parts.append("\nKEY FORMULAS / FACTS (translate to spoken form — never read raw LaTeX):")
        for kf in key_formulas:
            latex = kf.get("latex", "")
            desc = kf.get("description", "")
            parts.append(f"  - {latex}  ({desc})" if desc else f"  - {latex}")
    if common_mistakes:
        parts.append("\nCOMMON MISCONCEPTIONS (worth surfacing in dialogue):")
        for cm in common_mistakes:
            parts.append(
                f"  - Mistake: {cm.get('mistake', '')}\n"
                f"    Why it happens: {cm.get('why', '')}\n"
                f"    Correction: {cm.get('correction', '')}"
            )
    if tips_and_tricks:
        parts.append("\nTIPS & TRICKS the hosts can share:")
        for tip in tips_and_tricks:
            parts.append(f"  - {tip}")
    if conceptual_overview:
        parts.append("\nCONCEPTUAL OVERVIEW (for grounding, not for direct quoting):")
        for k, v in conceptual_overview.items():
            if v:
                parts.append(f"  {k}: {v}")
    parts.append(
        "\nWrite the full podcast script as a PodcastScript object. "
        "Remember the schema, the TTS rules, and the structural rules "
        "for speaker turn-taking."
    )
    return "\n".join(parts)


async def generate_podcast_script(
    *,
    topic: str,
    subtopic: str,
    description: str = "",
    learning_objectives: Optional[list[str]] = None,
    key_formulas: Optional[list[dict]] = None,
    common_mistakes: Optional[list[dict]] = None,
    tips_and_tricks: Optional[list[str]] = None,
    conceptual_overview: Optional[dict] = None,
    agent: Optional[Agent] = None,
) -> PodcastScript:
    """Generate one PodcastScript via one-shot structured output.

    Returns the validated Pydantic object. The Next.js orchestrator
    converts to JSON for persistence + client delivery.
    """
    agent_ = agent or podcast_agent
    prompt = _build_podcast_prompt(
        topic=topic,
        subtopic=subtopic,
        description=description,
        learning_objectives=learning_objectives or [],
        key_formulas=key_formulas or [],
        common_mistakes=common_mistakes or [],
        tips_and_tricks=tips_and_tricks or [],
        conceptual_overview=conceptual_overview,
    )

    parsed: Optional[PodcastScript] = None
    last_repr: str = ""
    for attempt in range(2):
        run_output = await agent_.arun(
            prompt,
            stream=False,
            output_schema=PodcastScript,
        )
        for attr in ("content", "structured_output", "output"):
            value = getattr(run_output, attr, None)
            if isinstance(value, PodcastScript):
                parsed = value
                break
            if isinstance(value, dict):
                try:
                    parsed = PodcastScript.model_validate(value)
                    break
                except Exception:
                    pass
        if parsed is not None:
            break
        last_repr = (
            f"(got {type(run_output).__name__}; "
            f"content type={type(getattr(run_output, 'content', None)).__name__}; "
            f"sample={str(getattr(run_output, 'content', ''))[:200]})"
        )
        sys.stderr.write(
            f"[podcast_agent] attempt {attempt + 1} did not yield a parsed "
            f"PodcastScript; retrying once.\n"
        )

    if parsed is None:
        raise RuntimeError(
            f"podcast_agent.arun did not return a PodcastScript after retry {last_repr}"
        )

    return parsed
