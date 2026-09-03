"""
ElevenLabs TTS adapter — converts a brief's narration script into audio +
word-level timings. Mutates the brief in place to fill `audio_url`,
`audio_duration_s`, and `word_timings`.

Uses ElevenLabs' character-level timestamps API (Convert with Timestamps),
which returns one entry per character with start/end times. We aggregate those
into word-level timings via whitespace tokenization, which is what the brief
schema and the QA pipeline expect.

Docs: https://elevenlabs.io/docs/api-reference/text-to-speech-with-timestamps
"""
from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

import httpx

from ..config import Config

ELEVENLABS_BASE = "https://api.elevenlabs.io/v1"
# Eleven Multilingual v2 has the best prosody for English motivator content.
DEFAULT_MODEL = "eleven_multilingual_v2"


def synthesize_with_timings(
    text: str,
    output_path: Path,
    *,
    config: Config | None = None,
    model_id: str = DEFAULT_MODEL,
) -> dict[str, Any]:
    """
    Call ElevenLabs TTS-with-timestamps. Returns a dict with:
      - audio_path: str (where the mp3 was written)
      - duration_s: float
      - word_timings: list[{word, start_s, end_s}]

    Raises on HTTP error.
    """
    cfg = config or Config.from_env()
    api_key, voice_id = cfg.require_elevenlabs()

    url = f"{ELEVENLABS_BASE}/text-to-speech/{voice_id}/with-timestamps"
    payload = {
        "text": text,
        "model_id": model_id,
        "output_format": "mp3_44100_128",
        "voice_settings": {
            "stability": 0.55,
            "similarity_boost": 0.75,
            "style": 0.2,
            "use_speaker_boost": True,
        },
    }

    with httpx.Client(timeout=60.0) as client:
        r = client.post(
            url,
            headers={"xi-api-key": api_key, "content-type": "application/json"},
            json=payload,
        )
    r.raise_for_status()
    data = r.json()

    # Decode and write audio.
    audio_b64 = data["audio_base64"]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(base64.b64decode(audio_b64))

    # Parse character timestamps → word timings.
    align = data.get("alignment") or data.get("normalized_alignment") or {}
    chars: list[str] = align.get("characters", [])
    char_starts: list[float] = align.get("character_start_times_seconds", [])
    char_ends: list[float] = align.get("character_end_times_seconds", [])

    word_timings = _chars_to_words(chars, char_starts, char_ends)
    duration_s = char_ends[-1] if char_ends else 0.0

    return {
        "audio_path": str(output_path),
        "duration_s": float(duration_s),
        "word_timings": word_timings,
    }


def _chars_to_words(
    chars: list[str], starts: list[float], ends: list[float]
) -> list[dict[str, Any]]:
    """Aggregate per-character timing into per-word timing on whitespace boundaries."""
    if not chars or len(chars) != len(starts) or len(starts) != len(ends):
        return []
    words: list[dict[str, Any]] = []
    cur_word = ""
    cur_start: float | None = None
    cur_end: float | None = None
    for ch, s, e in zip(chars, starts, ends):
        if ch.isspace():
            if cur_word and cur_start is not None and cur_end is not None:
                words.append(
                    {
                        "word": cur_word,
                        "start_s": round(cur_start, 3),
                        "end_s": round(cur_end, 3),
                    }
                )
            cur_word = ""
            cur_start = None
            cur_end = None
        else:
            if cur_start is None:
                cur_start = s
            cur_end = e
            cur_word += ch
    if cur_word and cur_start is not None and cur_end is not None:
        words.append(
            {
                "word": cur_word,
                "start_s": round(cur_start, 3),
                "end_s": round(cur_end, 3),
            }
        )
    return words


def apply_to_brief(brief: dict[str, Any], audio_path: Path, config: Config | None = None) -> dict[str, Any]:
    """Synthesize the brief's narration and patch it into the brief in place."""
    script = brief["narration"]["script"]
    result = synthesize_with_timings(script, audio_path, config=config)
    brief["narration"]["audio_url"] = str(audio_path)
    brief["narration"]["audio_duration_s"] = result["duration_s"]
    brief["narration"]["word_timings"] = result["word_timings"]
    # The brief generator estimates beat durations from word count — usually
    # over-allocates by 20–40% because it assumes slower speech than ElevenLabs
    # actually produces. Realign every beat to the measured timings so the
    # composition runs exactly as long as the audio.
    realign_beats_to_audio(brief)
    return brief


_PUNCT_TR = str.maketrans("", "", ".,;:!?\"'()—-")


def _normalize_word(w: str) -> str:
    return w.translate(_PUNCT_TR).strip().lower()


def realign_beats_to_audio(brief: dict[str, Any]) -> None:
    """
    Rewrite each beat's start_s/end_s using the measured word timings.

    For each beat with a non-empty narration_span:
      - Tokenize the span into words.
      - Find that sequence in narration.word_timings starting from the previous
        beat's word cursor.
      - Set start_s to the first matched word's start_s and end_s to the last
        matched word's end_s.

    For beats with empty narration_span (pure visual development between
    speaking beats), squeeze them into the gap between the preceding speaking
    beat's end and the following speaking beat's start. If they're at the
    start/end of the timeline, give them a small fixed duration.

    Audio's total duration becomes the new composition duration. The brief's
    `qa_constraints` are unchanged; if a beat's span isn't found in the word
    timings, that beat keeps its original timing and we log a warning.
    """
    words = brief["narration"].get("word_timings") or []
    if not words:
        print("  [realign] no word timings — skipping (composition may have audio/visual mismatch)")
        return

    normalized = [_normalize_word(w["word"]) for w in words]
    audio_duration = brief["narration"].get("audio_duration_s") or (
        words[-1]["end_s"] if words else 0.0
    )

    # First pass: locate the word span for every beat that has narration.
    cursor = 0  # search start index — moves forward as beats consume words
    located: list[tuple[int, int] | None] = []  # (start_word_idx, end_word_idx) inclusive, or None

    for beat in brief["beats"]:
        span = (beat.get("narration_span") or "").strip()
        if not span:
            located.append(None)
            continue
        target = [_normalize_word(w) for w in span.split() if _normalize_word(w)]
        if not target:
            located.append(None)
            continue
        # Look for a contiguous match of `target` in normalized[cursor:].
        idx = _find_subseq(normalized, target, cursor)
        if idx < 0:
            # Try a relaxed match — drop trailing punctuation/tiny words, or
            # allow approximate match on first N words.
            idx = _find_subseq_loose(normalized, target, cursor)
        if idx < 0:
            print(
                f"  [realign] could not locate narration_span for beat {beat['id']!r}; "
                f"keeping original timing. Span: {span!r}"
            )
            located.append(None)
            continue
        end_idx = idx + len(target) - 1
        located.append((idx, end_idx))
        cursor = end_idx + 1  # next beat searches after this one

    # Second pass: apply the timings.
    speaking_indices = [i for i, x in enumerate(located) if x is not None]
    if not speaking_indices:
        print("  [realign] no beats matched word timings — leaving brief alone")
        return

    # Set start/end for speaking beats from the timings.
    for i in speaking_indices:
        start_w, end_w = located[i]  # type: ignore[misc]
        brief["beats"][i]["start_s"] = round(words[start_w]["start_s"], 3)
        brief["beats"][i]["end_s"] = round(words[end_w]["end_s"], 3)

    # Fill in empty-narration beats by interpolating between neighbors.
    for i, beat in enumerate(brief["beats"]):
        if located[i] is not None:
            continue
        # This beat has no narration. Place it between adjacent speaking beats.
        prev_speaking = max((j for j in speaking_indices if j < i), default=None)
        next_speaking = min((j for j in speaking_indices if j > i), default=None)
        if prev_speaking is None and next_speaking is None:
            continue  # all silent — nothing to do
        if prev_speaking is None:
            # Beat is before any speech — open the timeline a bit.
            beat["start_s"] = 0.0
            beat["end_s"] = brief["beats"][next_speaking]["start_s"]
        elif next_speaking is None:
            # Beat is after the last speech — extend to audio end.
            beat["start_s"] = brief["beats"][prev_speaking]["end_s"]
            beat["end_s"] = round(audio_duration, 3)
        else:
            # Sandwich beat — fill the gap.
            beat["start_s"] = brief["beats"][prev_speaking]["end_s"]
            beat["end_s"] = brief["beats"][next_speaking]["start_s"]

    # Ensure beats are contiguous (no gaps, no overlaps) and clamp to audio end.
    for i in range(len(brief["beats"]) - 1):
        if brief["beats"][i]["end_s"] > brief["beats"][i + 1]["start_s"]:
            # Overlap — shrink the earlier beat
            brief["beats"][i]["end_s"] = brief["beats"][i + 1]["start_s"]
        elif brief["beats"][i]["end_s"] < brief["beats"][i + 1]["start_s"]:
            # Gap — extend earlier beat to close it (the visual hold pattern from Ex1)
            brief["beats"][i]["end_s"] = brief["beats"][i + 1]["start_s"]
    # Final beat ends at audio_duration (clamp).
    brief["beats"][0]["start_s"] = 0.0
    brief["beats"][-1]["end_s"] = round(audio_duration, 3)

    # Enforce a minimum outro duration. When the last beat is a silent
    # visual-development beat (no narration_span) but the previous
    # speaking beat consumed audio right up to audio_duration, the outro
    # collapses to 0 seconds — the renderer's defensive zero-skip then
    # drops it entirely and the takeaway visual never appears.
    #
    # Extend the composition past audio_duration to give the outro its
    # airtime. The audio is fixed-length; the trailing seconds will be
    # silent video — that's intentional, lets the takeaways dwell.
    OUTRO_MIN_DURATION_S = 4.0
    TRANSITION_MIN_DURATION_S = 1.5
    last_beat = brief["beats"][-1]
    if not (last_beat.get("narration_span") or "").strip():
        current_dur = last_beat["end_s"] - last_beat["start_s"]
        if current_dur < OUTRO_MIN_DURATION_S:
            extension = OUTRO_MIN_DURATION_S - current_dur
            last_beat["end_s"] = round(last_beat["end_s"] + extension, 3)
            print(
                f"  [realign] outro beat {last_beat['id']!r} had {current_dur:.2f}s, "
                f"extended composition by {extension:.2f}s to honor "
                f"{OUTRO_MIN_DURATION_S}s minimum"
            )

    # Same idea for internal silent beats — give them at least
    # TRANSITION_MIN_DURATION_S. We can't extend the composition for
    # interior beats without shifting later beats, so we instead steal
    # from the immediately-preceding speaking beat's tail. Skip if the
    # preceding beat is already shorter than 3s (don't compress it
    # further; better to leave a too-short silent beat than break
    # narration alignment).
    for i, beat in enumerate(brief["beats"][:-1]):  # skip last; handled above
        if (beat.get("narration_span") or "").strip():
            continue
        dur = beat["end_s"] - beat["start_s"]
        if dur >= TRANSITION_MIN_DURATION_S:
            continue
        steal = TRANSITION_MIN_DURATION_S - dur
        if i > 0:
            prev = brief["beats"][i - 1]
            prev_dur = prev["end_s"] - prev["start_s"]
            if prev_dur > 3.0 + steal:
                prev["end_s"] = round(prev["end_s"] - steal, 3)
                beat["start_s"] = prev["end_s"]
                print(
                    f"  [realign] silent beat {beat['id']!r} had {dur:.2f}s, "
                    f"stole {steal:.2f}s from {prev['id']!r}"
                )

    # Leave audio_duration_s untouched — it describes the actual audio
    # file. When the outro extension above pushes beats[-1].end_s past
    # audio_duration_s, the composition's total duration (derived from
    # beats[-1].end_s in Root.tsx's durationFrames) becomes longer than
    # the audio, and the trailing portion plays as silent video. That
    # is exactly what we want for a takeaway-dwell outro.
    composition_duration = brief["beats"][-1]["end_s"]
    print(
        f"  [realign] beats reallocated to audio: "
        f"{audio_duration:.2f}s audio, {composition_duration:.2f}s composition, "
        f"{len(speaking_indices)}/{len(brief['beats'])} beats anchored to word timings"
    )


def _find_subseq(haystack: list[str], needle: list[str], start: int = 0) -> int:
    """Find the first index >= start where `needle` matches contiguously in `haystack`."""
    if not needle:
        return -1
    n = len(needle)
    for i in range(start, len(haystack) - n + 1):
        if haystack[i : i + n] == needle:
            return i
    return -1


def _find_subseq_loose(haystack: list[str], needle: list[str], start: int = 0) -> int:
    """
    Looser fallback: match the first 3 needle words, allow 1 mismatch in the rest.
    Useful when narration_span has slight punctuation/whitespace divergence from
    the actual script tokenization.
    """
    if len(needle) < 1:
        return -1
    prefix = needle[: min(3, len(needle))]
    for i in range(start, len(haystack) - len(prefix) + 1):
        if haystack[i : i + len(prefix)] == prefix:
            # Verify the rest with up to 1 mismatch.
            mismatches = 0
            for j in range(len(prefix), len(needle)):
                if i + j >= len(haystack) or haystack[i + j] != needle[j]:
                    mismatches += 1
                    if mismatches > 1:
                        break
            if mismatches <= 1:
                return i
    return -1


def main():
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--brief", type=Path, required=True, help="Brief JSON to update in place")
    ap.add_argument("--audio-out", type=Path, required=True, help="Where to write the .mp3")
    args = ap.parse_args()

    brief = json.loads(args.brief.read_text())
    apply_to_brief(brief, args.audio_out)
    args.brief.write_text(json.dumps(brief, indent=2))
    print(f"audio: {args.audio_out} ({args.audio_out.stat().st_size} bytes)")
    print(f"duration: {brief['narration']['audio_duration_s']:.2f}s")
    print(f"words: {len(brief['narration']['word_timings'])}")


if __name__ == "__main__":
    main()
