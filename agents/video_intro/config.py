"""Config — reads API keys + per-step model overrides from environment.

Loaded from .env by the orchestrator. Anthropic authors the brief and
primitives; ElevenLabs synthesizes the narration. External video-gen
keys (Google / Runway) were dropped along with the generative tier —
see remove/generative-tier.
"""
from __future__ import annotations

import os
from dataclasses import dataclass


# Default model — the one we know works across all six pipeline call
# sites (brief, sketch, static author, living author, revise, vision
# critique). Each individual call site can be overridden via the
# VIDEO_INTRO_MODEL_* env vars (see Config.from_env below).
#
# Per-step recommendations (see plan in commit history for reasoning):
#
#   VIDEO_INTRO_MODEL_BRIEF     → strongest reasoning (e.g. Opus)
#       The brief is high-leverage: it juggles ~10 prompt rules,
#       writes narration, picks applications, allocates beats. Most
#       observed failures here are instruction-following failures.
#
#   VIDEO_INTRO_MODEL_SKETCH    → strongest reasoning (e.g. Opus)
#       Composition planning. The hard part isn't writing the JSON,
#       it's resisting overcomplication. Stronger reasoning helps.
#
#   VIDEO_INTRO_MODEL_AUTHOR    → strong code model (Sonnet is sweet spot)
#       TypeScript / React / SVG emission against an explicit sketch.
#       Both the static and living authors AND revise use this.
#
#   VIDEO_INTRO_MODEL_CRITIQUE  → strongest vision+reasoning (e.g. Opus)
#       Quality gate. False negatives waste retry budget, false
#       positives ship bad primitives. Vision strength matters.
#
# Defaults below preserve current behavior (all Sonnet). Set the env
# vars in agents/.env to upgrade specific steps.
DEFAULT_MODEL = "claude-sonnet-4-6"


@dataclass(frozen=True)
class Config:
    """Config — API keys + per-step model overrides for the pipeline."""

    anthropic_api_key: str | None
    elevenlabs_api_key: str | None
    elevenlabs_voice_id: str | None

    # Per-step model overrides. All default to DEFAULT_MODEL when the
    # corresponding env var is unset — current Sonnet behavior preserved.
    model_brief: str
    model_sketch: str
    model_author: str
    model_critique: str

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY"),
            elevenlabs_api_key=os.environ.get("ELEVENLABS_API_KEY"),
            elevenlabs_voice_id=os.environ.get("ELEVENLABS_VOICE_ID"),
            model_brief=os.environ.get("VIDEO_INTRO_MODEL_BRIEF", DEFAULT_MODEL),
            model_sketch=os.environ.get("VIDEO_INTRO_MODEL_SKETCH", DEFAULT_MODEL),
            model_author=os.environ.get("VIDEO_INTRO_MODEL_AUTHOR", DEFAULT_MODEL),
            model_critique=os.environ.get("VIDEO_INTRO_MODEL_CRITIQUE", DEFAULT_MODEL),
        )

    def require_anthropic(self) -> str:
        if not self.anthropic_api_key:
            raise RuntimeError(
                "ANTHROPIC_API_KEY missing — add it to athena/.env or agents/.env"
            )
        return self.anthropic_api_key

    def require_elevenlabs(self) -> tuple[str, str]:
        if not (self.elevenlabs_api_key and self.elevenlabs_voice_id):
            raise RuntimeError(
                "ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID required for TTS"
            )
        return self.elevenlabs_api_key, self.elevenlabs_voice_id
