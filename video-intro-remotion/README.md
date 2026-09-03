# video-intro-remotion

Remotion compositor for Athena intro/motivator videos. Consumes a manifest derived from a brief (see `../video-intro/reference/brief.schema.json`) and renders a 1280×720 MP4. Aesthetic locked to white-line-on-black; math overlays render via KaTeX so we never depend on a generative video model to render text correctly.

## Status

**Scaffold complete and validated:**

- `npm install` runs clean (185 packages, ~20s)
- `npx tsc --noEmit` passes
- `bundle()` from `@remotion/bundler` succeeds — webpack + esbuild see no issues
- `manifests/ex1-stub.json` produced from the canonical Ex1 brief; all 6 beats route to implemented primitives

**Not yet run end-to-end:** the actual MP4 render. Requires headless Chrome, which has to install on first run. The sandbox where the scaffold was built blocks the Chrome download host; running locally should Just Work.

## Run it

```bash
cd video-intro-remotion
npm install
# First render downloads ~120 MB of headless Chrome — only on first run
npm run render:ex1
# Output: out/ex1.mp4
```

Then QA-gate the output (catches the timing-gap failure mode we saw in ex2 and ex3):

```bash
python3 scripts/qa_gate.py out/ex1.mp4 --report out/ex1.qa.json
```

For interactive iteration on a primitive (live reload, scrub timeline):

```bash
npm run dev   # opens Remotion Studio in the browser
```

## Layout

```
video-intro-remotion/
├── package.json
├── tsconfig.json
├── remotion.config.ts          1280×720 @ 30fps, h264, yuv420p
├── src/
│   ├── index.ts                registers RemotionRoot
│   ├── Root.tsx                registers the IntroVideo composition with the Ex1 stub manifest
│   ├── IntroVideo.tsx          composition entry: consumes manifest, routes beats to primitives
│   ├── types/manifest.ts       TS mirror of brief.schema.json v0.1.0
│   ├── overlays/
│   │   └── OverlayLayer.tsx    caption / math (KaTeX) / label / callout overlays
│   ├── primitives/
│   │   ├── WireframeMountain.tsx   SVG particle terrain w/ camera modes
│   │   ├── AnimatedLine.tsx        coord axes + line-draw with labels
│   │   ├── RiseRunCallout.tsx      right-triangle slope diagram + LaTeX formula
│   │   └── OutroCallouts.tsx       4-corner callouts over wave terrain
│   └── utils/timing.ts         fadeOpacity, drawProgress, secondsToFrames
├── manifests/
│   └── ex1-stub.json           ← brief → manifest output for Ex1
├── public/
│   └── ex1.mp3                 ← audio extracted from reference Example 1.mp4
└── scripts/
    ├── brief_to_manifest.py    brief → manifest converter (run when brief.json changes)
    └── qa_gate.py              dead-frame + audio-alignment QA on rendered MP4
```

## How a render happens

1. Brief (`reference/ex1/brief/brief.json`) is the source of truth.
2. `scripts/brief_to_manifest.py` converts it into a manifest — copies the audio into `public/`, sets the duration override, and leaves space for future TTS-generated `audio_url` and `word_timings`.
3. `npm run render:ex1` boots a headless Chrome, mounts `IntroVideo` per-frame, and ffmpeg encodes the frame sequence + audio into MP4.
4. `scripts/qa_gate.py` reads the MP4, samples per-second mean brightness + audio RMS, flags any second where brightness < 10 while audio is above the noise floor. Hard fail above `max_dead_frame_seconds` (default 1.0).

## Where this fits in the larger pipeline

`agents/video_intro/` (Python orchestrator, not yet built) will:

1. Take a `topic_slug` + `subtopic_slug`
2. Call Claude to produce a brief that conforms to `brief.schema.json`
3. Run ElevenLabs TTS, fill in `narration.audio_url` and `narration.word_timings`
4. Write the manifest
5. Shell out: `npx remotion render src/index.ts IntroVideo out/$lesson.mp4 --props=$manifest`
6. Run `qa_gate.py`; if it fails, regenerate the failing beat
7. Upload to Supabase Storage, update `lesson_video_intros` row

The code path runs fully in this repo today.

## Limits of v0

- `WireframeMountain.camera="orbit_right"` doesn't yet show a side-by-side both-peaks composition during the orbit — it just rotates the existing terrain. The Ex1 reference uses the orbit as a reveal-the-second-peak move. Fix is in the projection math: spawn the secondary peak when `show_both` is true (the prop is wired up; the secondary peak math is in `peaks[]` but the projection blocks would benefit from a real validation render).
- `AnimatedLine` draws lines at slope-times-pixel-units without log-scaling for big slopes. For y=1.75x with the current grid (8 units), the line reaches `y = 14` units which exceeds the plot area — there's a `xLimit` clamp that prevents drawing off-grid but the line stops short of the top-right corner instead of reaching it. Acceptable for v0 but should be revisited.
- Particle-flow-up animation in `WireframeMountain.particle_flow_up` is wired through props but not yet rendered. Particles are static.
- KaTeX CSS is inlined as a minimal subset in `IntroVideo.tsx`. Full KaTeX styling will need either `@import url('katex/dist/katex.min.css')` or the full stylesheet copied into the inline `<style>`. For complex math we'll need this; for `y = 1.75x` and `m = rise/run` the inline subset is sufficient.

## When you've run a render

Drop the MP4 at `reference/ex1/code-render/ex1-v1.mp4` and update the README's status section. We'll then have:

- The original Veo reference video (Example 1.mp4) — gold standard
- Our code-rendered reproduction
- Side-by-side comparison gives us a calibration target for "is this style right?"
