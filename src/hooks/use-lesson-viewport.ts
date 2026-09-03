"use client";

import { useEffect, useState } from "react";

export type LessonViewport = "desktop" | "mobile-portrait" | "mobile-landscape";

/** At/below this CSS width the lesson surface is treated as mobile. Covers
 *  phones and portrait small tablets; desktop + landscape tablets stay on the
 *  existing wide whiteboard renderer. */
const MOBILE_MAX_WIDTH = 820;

/**
 * Classifies the current viewport for lesson rendering: the desktop SVG
 * whiteboard, the portrait mobile renderer, or (for now) a landscape-gated
 * mobile state that can fall back to the wide board.
 *
 * SSR-safe by construction: the server render and the first client paint both
 * report "desktop", so there is no hydration mismatch; the real classification
 * lands in a post-mount effect. Consumers that want the existing behavior on
 * desktop therefore keep it with zero change until a phone actually mounts.
 */
export function useLessonViewport(): LessonViewport {
  const [viewport, setViewport] = useState<LessonViewport>("desktop");

  useEffect(() => {
    const portraitMq = window.matchMedia("(orientation: portrait)");

    const compute = (): LessonViewport => {
      if (window.innerWidth > MOBILE_MAX_WIDTH) return "desktop";
      return portraitMq.matches ? "mobile-portrait" : "mobile-landscape";
    };

    const onChange = () => setViewport(compute());
    onChange();

    window.addEventListener("resize", onChange);
    portraitMq.addEventListener("change", onChange);
    return () => {
      window.removeEventListener("resize", onChange);
      portraitMq.removeEventListener("change", onChange);
    };
  }, []);

  return viewport;
}
