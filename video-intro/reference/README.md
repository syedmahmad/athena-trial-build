# Video Intro — Reference Set

Three example videos uploaded as the starting point for the intro-video pipeline. This folder contains everything we've reverse-engineered about them so the rest of the project has a fixed ground truth to point at.

## What's here

```
reference/
├── README.md                          (this file)
├── brief.schema.json                  Brief contract — consumed by both renderers
├── ex1/                               Linear equations / slope — full-length good example
│   ├── audio/ex1.wav                  16kHz mono PCM extracted from source mp4
│   ├── frames/                        Per-second frames + dense 2 fps frames + contact sheet
│   ├── transcript/
│   │   ├── pocketsphinx.json          Noisy word-level timings (best we got in sandbox)
│   │   ├── pocketsphinx_phrases.json
│   │   └── reconstructed.md           Cleaned-up transcript with confidence notes
│   └── brief/brief.json               Hand-written brief that the pipeline must be able to render
├── ex2/                               Linear equations / slope — has dead-frame problem (~14s gap)
│   ├── audio/                         …
│   └── transcript/reconstructed.md
└── ex3/                               Probability — worst dead-frame problem (~20s gap)
    ├── audio/                         …
    └── transcript/reconstructed.md
```

## Findings from analysis

### Style
All three are **white linework on pure black**. Background motifs differ by topic:
- **wireframe_terrain** (ex1, ex2) — 3D mountain meshes for slope/linear concepts
- **starfield** (ex3) — coin in space for probability

That's a useful axis — we'll let the brief generator pick `background_motif` per lesson.

### The Veo text problem (confirmed by visual evidence)
Source frames show **two layers of text**: the bottom captions are clean prose ("Slope equals rise over run"), but text rendered *inside* the frame by Veo is garbled — e.g. ex1 t=12s shows "STETEEP > SHARPLY" instead of "STEEP > SHARPLY", ex1 t=24s shows "HAS SMALLEN SLOPE BECAUSE ELCANGES ELEVATION CHANGE MORE SCHOWLY".

The manual workflow handled this by **overlaying clean captions in post over the Veo output**. Our pipeline replaces that with deterministic KaTeX/text rendering in Remotion. The brief schema enforces this — `overlays[]` is rendered by the compositor, never the video model.

### The timing-gap problem (quantified)
Per-second mean frame brightness (proxy for visual activity, 0–255):

| Example | Duration | Animation ends at | Dead-frame seconds | Verdict |
|---|---|---|---|---|
| ex1 | 32.0s | full length | 0s | clean reference |
| ex2 | 28.5s | ~15s | ~13s | broken |
| ex3 | 35.6s | ~15s (brief revival 30–33s) | ~20s | very broken |

Cause: the manual workflow generated visuals first and let audio fill in. Our pipeline inverts the order — **TTS runs first, beats are allocated against the measured audio timeline, and dead-frame seconds are a hard fail in the QA gate** (`qa_constraints.max_dead_frame_seconds` in the brief).

### Topic mapping (confirmed against `agents/app/pre_generation/content_workflow.py`)

The slug derivation is deterministic: `name.lower().replace(" ", "-").replace("(", "").replace(")", "").replace(",", "")` via `_make_slug()` in agents.

| Example | Display name | `topic_slug` | `subtopic_slug` |
|---|---|---|---|
| ex1 | Algebra → Linear equations (one variable) | `algebra` | `linear-equations-one-variable` |
| ex2 | Algebra → Linear equations (one variable) | `algebra` | `linear-equations-one-variable` |
| ex3 | Problem Solving and Data Analysis → Probability | `problem-solving-and-data-analysis` | `probability` |

ex1 and ex2 cover the same lesson but with different framings — useful for testing that the brief generator can produce variation without losing concept fidelity.

### Recovered ground-truth captions (ex1)
From visible bottom-overlay text in source frames:
- ~12s: "Steep trail climbs sharply."
- ~18s: "The gentler mountain has a smaller slope because elevation changes more slowly."
- ~24s: "Slope equals rise over run."

### Recovered math (ex1)
Read directly from frame at t=18s:
- Steep trail: `y = 1.75x`
- Gentle trail: `y = 0.65x`
- Slope label: `m = 0.65`

These are locked into `ex1/brief/brief.json` so our renderer can produce identical math.

## Outstanding before we lock the brief

1. **Re-run real Whisper** on a machine that can reach HF / OpenAI CDN. Sandbox can't — pocketsphinx is the fallback used here. Overwrite `transcript/transcript.json` once available.
2. **Confirm topic/subtopic slugs** against the live Supabase `topics` and `subtopics` tables. Current values in `ex1/brief/brief.json` are guesses based on the slug convention.
3. **Brief schema review** — `brief.schema.json` is v0.1.0. Likely needs a `pacing` field (slow/medium/fast) and a way to mark beats as "optional" so a code-render can omit beats that need image-gen if the anchor asset hasn't been produced yet.

## How this is used downstream

- **Brief generator** (LLM in `agents/video_intro/`) produces a JSON conforming to `brief.schema.json` from a lesson + topic input.
- **Code renderer** (Remotion in `video-intro-remotion/`) consumes the brief → manifest → MP4. Maps `visual.renderer_hint.code` to Remotion components.
- **QA gate** runs `qa_constraints` against the rendered MP4 — flags dead frames, audio-visual misalignment.

The code renderer writes to the `lesson_video_intros` table; serve order is `code_render.ready > no video`.
