/**
 * Brand constants for the standalone SAT positioning + progress site.
 *
 * "Ascent" is a working name — swap it here (and nowhere else) when the
 * real brand lands. The surface lives under /sat and is deliberately
 * self-contained (same pattern as /educators) so it can split to its own
 * domain later via a host rewrite.
 */
export const SAT_BRAND = {
  name: "Ascent",
  microLabel: "SAT PREP",
  tagline: "Know exactly where you stand.",
  description:
    "A level-setting diagnostic pins down your starting point, adaptive lessons close the gaps, and every session moves your score line up and to the right.",
} as const;

/** Route roots for the SAT surface. */
export const SAT_ROUTES = {
  landing: "/sat",
  onboarding: "/sat/onboarding",
  dashboard: "/sat/dashboard",
  progress: "/sat/progress",
} as const;
