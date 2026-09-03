import { interpolate, Easing } from "remotion";

/**
 * Convert seconds to frames at a given fps.
 */
export function secondsToFrames(seconds: number, fps: number): number {
  return Math.round(seconds * fps);
}

/**
 * Fade in/out helper that respects appear_s / disappear_s relative to a beat.
 * Returns an opacity in [0, 1].
 *
 * - If `disappear_s` is undefined: fades in once at appear_s, stays on.
 * - If `disappear_s` is set: fades in at appear_s and out at disappear_s.
 *
 * `fadeMs` defaults to 350ms — feels right for white-on-black captions.
 */
export function fadeOpacity({
  framesSinceBeatStart,
  fps,
  appear_s = 0,
  disappear_s,
  fadeMs = 350,
}: {
  framesSinceBeatStart: number;
  fps: number;
  appear_s?: number;
  disappear_s?: number;
  fadeMs?: number;
}): number {
  const t = framesSinceBeatStart / fps;
  const fade = fadeMs / 1000;

  // Before appear: fully transparent.
  if (t < appear_s) return 0;

  // After disappear (with fade): fully transparent.
  if (disappear_s !== undefined && t > disappear_s + fade) return 0;

  // Fading in.
  if (t < appear_s + fade) {
    return interpolate(t, [appear_s, appear_s + fade], [0, 1], {
      easing: Easing.out(Easing.cubic),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }

  // Fading out.
  if (disappear_s !== undefined && t > disappear_s) {
    return interpolate(t, [disappear_s, disappear_s + fade], [1, 0], {
      easing: Easing.in(Easing.cubic),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }

  return 1;
}

/**
 * Convert beat-relative seconds to a draw-progress value [0, 1] for animations
 * like line drawing.
 */
export function drawProgress({
  framesSinceBeatStart,
  fps,
  startMs = 0,
  durationMs,
}: {
  framesSinceBeatStart: number;
  fps: number;
  startMs?: number;
  durationMs: number;
}): number {
  const t = framesSinceBeatStart / fps;
  const startS = startMs / 1000;
  const endS = startS + durationMs / 1000;
  return interpolate(t, [startS, endS], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}
