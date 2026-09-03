"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

const handleEnter = () => {
  try {
    sessionStorage.setItem("athena.glowHomework", "1");
  } catch {
    /* ignore */
  }
};

export default function EducatorsLanding() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6">
      {/* Ambient background — kept calm and dim for the educator surface */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="onb-orb onb-orb--a" />
        <div className="onb-orb onb-orb--b" />
        <div className="onb-orb onb-orb--c" />
        <div className="onb-noise" />
        <div className="onb-vignette" />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="font-mono-hud hud-dim mb-6 text-[10px] tracking-[0.3em]">
          FOR EDUCATORS
        </div>

        <h1 className="edu-serif text-7xl font-light tracking-[-0.04em] text-foreground sm:text-8xl">
          Athena
        </h1>

        <div className="mt-6 h-px w-16 bg-foreground/20" />

        <p className="mt-6 max-w-md text-base font-light tracking-wide text-foreground/55 sm:text-lg">
          Create homework in minutes. Students turn it in from one link,
          and it comes back graded.
        </p>

        <Link
          href="/educators/homework?new=1"
          onClick={handleEnter}
          className="group mt-14 inline-flex h-11 items-center gap-2 rounded-full border border-foreground/20 bg-background/40 px-7 text-xs font-medium uppercase tracking-[0.2em] text-foreground backdrop-blur-sm transition hover:border-foreground/50 hover:bg-foreground/5"
        >
          <span>Enter</span>
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </main>
  );
}
