"use client";

// Dev-only: index of internal tools under /dev. Each entry links to a
// page that's gated behind NODE_ENV elsewhere; this index itself is
// just a static list and renders fine in any build, but the targets
// 404 in production.

import Link from "next/link";

type Tool = {
  href: string;
  title: string;
  description: string;
};

const TOOLS: Tool[] = [
  {
    href: "/dev/lessons",
    title: "Eval Lessons",
    description:
      "Filesystem-loaded lessons under .local/evals/. Filter by variant / subtopic / verdict; click an iter to play it through the production MicroLesson renderer with a flagged-issue sidebar for triaging eval rejects.",
  },
  {
    href: "/dev/stories",
    title: "Step Stories",
    description:
      "Storybook-style gallery of every whiteboard step type, operation, and connector/animation (write_math, draw_shape, callouts, APPLY/COLLAPSE/STATE triplet, incomingArrow, flyInSubstitution, distribution arrows, math annotations, check_in / predict / fill_blank). Click to play; click again to replay. URL-linkable via ?story=<id>; right-side JSON inspector for copy-paste into ideal lessons.",
  },
  {
    href: "/dev/compare",
    title: "Compare Lessons",
    description:
      "Side-by-side player for two lessons. Pick from the eval iter / ideal-lesson list per pane (or pass ?left=<path>&right=<path>). Each side runs an independent MicroLesson with the dev scrubber, so you can A/B iter-N vs iter-N+1, or ideal vs generated, and align the timelines manually.",
  },
  {
    href: "/dev/lesson-intros",
    title: "Lesson Intros",
    description:
      "Preview rendered Remotion lesson-intro MP4s from video-intro-remotion/out/. Code-tier renders (free, no LLM video gen) — each video pairs a brief-authored beat sequence with ElevenLabs narration, deterministic React primitives, and KaTeX overlays. Includes inline CLI docs for generating + rendering new intros.",
  },
  {
    href: "/dev/fly",
    title: "Flying Answer",
    description:
      "Harness for the micro-lesson 'Extra Help' hand-off animation. Renders the real <FlyingAnswer> over a mock column (input line + Extra Help sidebar) with an editable message + Trigger button, so the transition can be tuned and screenshotted in isolation without walking a lesson to a 2nd-wrong takeover. Drive headlessly via .local/playwright/fly-capture.mjs.",
  },
];

export default function DevIndexPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold mb-1">Dev Tools</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Internal tooling for the micro-lesson pipeline. Not wired into navigation —
        reach by URL. All tool surfaces 404 in production builds.
      </p>

      <ul className="space-y-3">
        {TOOLS.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              className="block rounded-lg border px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{t.title}</span>
                <code className="text-xs font-mono text-muted-foreground">{t.href}</code>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{t.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
