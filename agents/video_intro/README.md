# `agents/video_intro/` — Video Intro Pipeline Orchestrator

Turns a `topic_slug` + `subtopic_slug` into everything Remotion needs to render an intro/motivator video: a structured brief, synthesized narration audio with word timings, a manifest staged in the Remotion project, **and — if the brief requests primitives that don't yet exist — the brand-new Remotion components implementing them.**

**Code-tier only.** Every visual is rendered by a deterministic React/Remotion primitive — there is no external video model and no per-clip cost. The generative tier (Veo / Runway) was removed in `remove/generative-tier`; if you need to bring it back, that commit is the starting point.

**Autonomous primitive authoring.** When the brief generator wants a primitive that doesn't exist in the library yet, it sets `_new` on the beat's `code` block with a spec. The orchestrator then asks Claude (separately) to author the .tsx file, registers it across the 3 registration files (IntroVideo / manifest types / KNOWN_PRIMITIVES), and sanity-renders 5 frames to validate. The final brief renders with the new primitive included.

## What's in here

```
agents/video_intro/
├── __init__.py
├── __main__.py             CLI: python -m video_intro generate / render
│                           Auto-loads .env via _bootstrap_env at import.
├── config.py               Reads API keys from env (Anthropic, ElevenLabs only)
├── brief_generator.py      Claude tool-use call → brief.json
│                           Also owns KNOWN_PRIMITIVES + build_system_prompt()
├── primitive_generator.py  Claude tool-use call → .tsx for a new primitive
├── patchers.py             Section-marker insertion utilities (regex)
├── sanity_render.py        5-frame validation harness for new primitives
├── adapters/
│   └── tts.py              ElevenLabs Convert-with-Timestamps → audio.mp3 + word_timings
└── prompts/                (empty — prompts live inline in *_generator.py for now)
```

## One-shot generation

```bash
cd ~/athena/agents

python -m video_intro generate \
    --topic-slug algebra \
    --subtopic-slug linear-equations-one-variable \
    --topic-name "Algebra" \
    --subtopic-name "Linear equations (one variable)" \
    --out out/algebra_linear \
    --remotion-root ../video-intro-remotion
```

What this does:

1. **Loads `.env`** automatically (walks up from this module looking for `agents/.env` and `.env`). No manual `set -a; . .env` step required.
2. **Calls Claude** (`claude-sonnet-4-20250514`) with a brief-author system prompt + the topic. Uses tool-use to get structured JSON back. Writes `brief.json`.
3. **Calls ElevenLabs** with the brief's narration script. Gets back MP3 + character-level timestamps. Aggregates timings to word level. Writes `audio.mp3` and patches `narration.audio_url` / `narration.audio_duration_s` / `narration.word_timings` into the brief.
4. **Writes `manifest.json`** — same shape as brief, plus a `render` block telling Remotion where the audio lives.
5. **Stages** the manifest + audio into the Remotion project at `--remotion-root` (default `video-intro-remotion/`).
6. **Prints the render command** so you can copy-paste. The recommended next step is the bundled `render` subcommand — it wraps the Remotion render *and* runs the QA gate (brightness + dead-frame check) so you catch composition problems before they ship:
   ```bash
   python -m video_intro render \
       --name algebra_linear \
       --remotion-root ../video-intro-remotion
   ```
   This emits the MP4 to `out/algebra_linear.mp4` AND a sidecar `out/algebra_linear.qa.json` that the /dev/lesson-intros preview page reads. Exits non-zero if the rendered video has any contiguous dead-frame run longer than 1s while audio is active. Pass `--allow-qa-fail` to keep the MP4 anyway (e.g. for visual inspection of the failure).

   Or run the raw `npx remotion render` and skip QA — fine for one-off renders but won't write the sidecar.

## Why the QA gate matters

A "dead frame" is a near-black frame while audio is still active. The most common cause now that the generative tier is gone: the brief author omitted `code` on a beat that has narration. The Remotion composition then renders that beat as black (caption + audio overlay only), which is fine for a short transition but reads as broken if it goes on for 5+ seconds.

The gate samples 1 frame per second + per-second audio activity. A beat that's intentionally silent visual development (no narration_span) won't flag — the audio-active check requires speech. Threshold: `--brightness-threshold` (default 10/255 mean) + `--max-dead-frame-seconds` (default 1.0).

## Iterating on the brief alone (no TTS spend)

```bash
python -m video_intro generate ... --skip-tts
```

Writes the brief but skips ElevenLabs. Useful when you're tuning the prompt and don't want to pay per iteration.

## Required env

| Var | Where used | Status in your repo |
|---|---|---|
| `ANTHROPIC_API_KEY` | brief generation | ✓ `agents/.env` |
| `ELEVENLABS_API_KEY` | TTS | ✓ root `.env` |
| `ELEVENLABS_VOICE_ID` | TTS | ✓ root `.env` |

Two keys, both loaded automatically from `.env` files via dotenv. Nothing else needed.

## What gets rendered

Each beat's `visual.renderer_hint.code` field references a primitive — either an EXISTING one (by snake_case name; see `KNOWN_PRIMITIVES` in `brief_generator.py`) or a NEW one with a `_new` spec attached.

The 9 starter primitives in `video-intro-remotion/src/primitives/`:
- `wireframe_mountain`, `animated_line`, `rise_run_callout`, `outro_callouts` — the originals
- `coordinate_axes`, `fraction_compare`, `callout_grid`, `scale_bar`, `coin_flip` — added with PR #26

Any further primitives appearing in `KNOWN_PRIMITIVES` were authored by the AI loop (see below).

## Autonomous primitive authoring

When Claude (in the brief author pass) writes a beat with a `_new` block on `code`, the orchestrator inserts a primitive-author phase between brief generation and TTS:

```
generate
  ├─ Claude → brief.json with N beats; M of them have `code._new`
  ├─ for each `_new` beat:
  │    ├─ Claude → .tsx for the requested primitive
  │    │   (3 existing primitives shown as in-context examples)
  │    ├─ write src/primitives/<PascalCase>.tsx
  │    ├─ patch IntroVideo.tsx (import + switch case)
  │    ├─ patch manifest.ts (discriminated-union member)
  │    ├─ patch brief_generator.py (KNOWN_PRIMITIVES entry)
  │    ├─ sanity-render 5 frames; on failure, re-prompt with the
  │    │  error log up to 3 times; on terminal failure, revert all
  │    │  patches and strip `code` from the beat
  │    └─ on success, strip `_new` (metadata only)
  ├─ ElevenLabs → audio.mp3 + word timings
  └─ stage manifest into Remotion project
```

Cost per run with `K` new primitives: ~$0.05 (brief) + K × ~$0.05–$0.15 (primitive authoring, more on retries) + ~$0.10 (TTS) = roughly $0.30–$0.70 for a brief that requests 2 new primitives.

To skip the AI primitive author (e.g. when iterating on the brief prompt and you don't want to spend Claude credits on primitive authoring), pass `--skip-primitive-author`. Beats with `_new` will fall back to caption-on-black; the QA gate will flag them at final render time.

If a primitive fails sanity-render 3 times, the orchestrator reverts the .tsx + patches and the beat drops back to caption-on-black. Net effect: the run still completes, but the QA gate will FAIL with a clear "X seconds of dead frames" message for the affected beats.

## When something goes wrong

- **`APIConnectionError`** on Anthropic — check the key isn't IP-locked.
- **ElevenLabs returns no alignment** — the model_id might not support timestamps. Falls back to empty `word_timings`; the brief's beat boundaries take over for caption sync.
- **Brief generates with `start_s` not at 0 / non-contiguous beats** — Claude sometimes lapses. Future iteration: add a post-validation pass that normalizes timing.
- **`ANTHROPIC_API_KEY missing`** despite the key being in `.env` — your shell may have exported `ANTHROPIC_API_KEY=""` (some sandboxes do this to scrub credentials from subprocesses). `_bootstrap_env` treats empty sensitive vars as unset and lets dotenv populate them — if the message still appears, check that the value in `.env` is non-empty.
