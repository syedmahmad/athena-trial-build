/**
 * Wrap-up video registry.
 *
 * A subtopic's "wrap-up" is a short lock-in animation that plays between the
 * micro-lesson and practice. Each wrap-up MP4 is rendered **silent and
 * caption-free** (see `video-intro-remotion/scripts/brief_to_manifest.py
 * --strip-captions` + the remotion render) — the narration that used to be
 * baked into the video is now spoken live by the app's TTS tutor in the
 * **user-selected voice**, and the subtitle is re-rendered in-app per beat.
 *
 * Why: a baked ElevenLabs voice + baked subtitle clash with a student who has
 * picked a different tutor voice — hearing a stranger read the wrap-up is
 * jarring. Stripping both from the video and re-speaking via
 * `playNarration()` (which routes through the `athena_voice` cookie) keeps the
 * wrap-up in the chosen voice. See the wrap-up pacing block in
 * `src/components/learning/micro-lesson.tsx`.
 *
 * Source of truth for the per-beat data is the brief that produced the video,
 * e.g. `agents/video_intro/briefs/linear_eq_two_var_wrapup.json`:
 *  - `narration`  ← the brief beat's `narration_span` (spoken; phonetically
 *                   friendly, e.g. "y equals negative two x plus three")
 *  - `caption`    ← the brief beat's `caption` overlay content (the concise
 *                   on-screen subtitle, e.g. "y = -2x + 3")
 *  - `startS`/`endS` ← the baked visual-beat boundaries in the rendered video.
 */

export interface WrapUpBeat {
  /** Stable beat id (mirrors the brief beat id). */
  id: string;
  /** Visual-beat start, in seconds, in the rendered video's timeline. */
  startS: number;
  /** Visual-beat end, in seconds. The pacer holds the video here until this
   *  beat's narration finishes. */
  endS: number;
  /** Spoken aloud via TTS in the user's chosen voice. */
  narration: string;
  /** Re-rendered on-screen as the subtitle for this beat. */
  caption: string;
}

export interface WrapUp {
  /** Public path to the silent, caption-free MP4. */
  videoUrl: string;
  /** Per-beat narration + caption timeline, in playback order. */
  beats: WrapUpBeat[];
}

/** Keyed by subtopic slug. Grows as more wrap-ups are authored — keep each
 *  entry's `beats` in sync with its source brief. */
export const WRAP_UPS: Record<string, WrapUp> = {
  "linear-equations-two-variables": {
    videoUrl: "/wrap-ups/linear-equations-two-variables.mp4",
    beats: [
      {
        id: "b1_setup",
        startS: 0,
        endS: 8,
        narration:
          "You are playing basketball at the top of a hill shaped like the equation y equals negative two x plus three.",
        caption: "You're playing basketball on a hill shaped like y = -2x + 3.",
      },
      {
        id: "b2_roll",
        startS: 8,
        endS: 12,
        narration: "Oh no! The basketball starts rolling down the slope.",
        caption: "Oh no! The basketball starts rolling down the slope.",
      },
      {
        id: "b3_slope",
        startS: 12,
        endS: 22,
        narration:
          "The negative two is the slope, which means the line goes down two units for every one unit to the right.",
        caption: "The -2 is the slope: down 2 for every 1 right.",
      },
      {
        id: "b4_yintercept",
        startS: 22,
        endS: 29,
        narration:
          "The plus three is the y-intercept, where the line starts on the graph.",
        caption: "The +3 is the y-intercept — where the line starts.",
      },
      {
        id: "b5_xintercept",
        startS: 29,
        endS: 36,
        narration:
          "The basketball reaches the x-intercept, where the line crosses the x-axis and y equals zero.",
        caption: "The ball reaches the x-intercept, where y = 0.",
      },
      {
        id: "b6_celebration",
        startS: 36,
        endS: 44,
        narration: "Yay! Now you know linear equations!",
        caption: "Yay! Now you know linear equations!",
      },
    ],
  },
};

/** Look up the wrap-up for a subtopic slug, if one exists. */
export function getWrapUp(subtopicSlug: string): WrapUp | undefined {
  return WRAP_UPS[subtopicSlug];
}
