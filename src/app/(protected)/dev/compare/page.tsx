"use client";

// Dev-only: side-by-side comparison of two lessons. Mounts two
// independent MicroLesson players (each with skipPractice + debugScrub)
// driven by `?left=<path>&right=<path>` query params. Each player runs
// on its own timeline; use each scrubber to align them manually. Useful
// for A/B'ing iter-N vs iter-N+1, or ideal vs generated.

import { Suspense, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { WhiteboardStep } from "@/types/whiteboard";
import { MicroLesson } from "@/components/learning/micro-lesson";

const DEV_METADATA = {} as const;

type IterMeta = {
  variant: string;
  topicSlug: string;
  subtopicSlug: string;
  iter: number;
  pass: boolean;
  adherenceScore: number;
  stepCount: number;
  lessonRelPath: string;
};

type LessonData = { steps: WhiteboardStep[] };

function labelFor(it: IterMeta): string {
  const iterTag = it.variant === "ideal" ? "ideal" : `iter-${it.iter}`;
  return `${it.variant}/${it.topicSlug}/${it.subtopicSlug}/${iterTag}`;
}

function parsePath(p: string): {
  variant: string;
  topicSlug: string;
  subtopicSlug: string;
  iterLabel: string;
} {
  const parts = p.split("/");
  if (parts[0] === "src" && parts[3] === "ideal-lessons") {
    const stem = (parts[4] ?? "").replace(/\.json$/, "");
    let topic = "ideal";
    let subtopic = stem;
    for (const prefix of ["advanced-math-", "algebra-"]) {
      if (stem.startsWith(prefix)) {
        topic = prefix.slice(0, -1);
        subtopic = stem.slice(prefix.length);
        break;
      }
    }
    return { variant: "ideal", topicSlug: topic, subtopicSlug: subtopic, iterLabel: "ideal" };
  }
  return {
    variant: parts[2] ?? "",
    topicSlug: parts[3] ?? "",
    subtopicSlug: parts[4] ?? "",
    iterLabel: parts[5] ?? "",
  };
}

function PaneHeader({
  side,
  path,
  options,
  onPick,
}: {
  side: "left" | "right";
  path: string;
  options: IterMeta[];
  onPick: (newPath: string) => void;
}) {
  const meta = path ? parsePath(path) : null;
  return (
    <div className="border-b px-3 py-1.5 flex items-center gap-2 text-xs bg-background shrink-0">
      <span className="font-mono uppercase tracking-wider text-muted-foreground">
        {side}
      </span>
      <select
        value={path}
        onChange={(e) => onPick(e.target.value)}
        className="flex-1 min-w-0 px-2 py-1 rounded border text-xs font-mono bg-background"
      >
        <option value="">— pick a lesson —</option>
        {options.map((it) => (
          <option key={it.lessonRelPath} value={it.lessonRelPath}>
            {labelFor(it)} · {it.stepCount}st · adh{it.adherenceScore.toFixed(2)} · {it.pass ? "PASS" : "FAIL"}
          </option>
        ))}
      </select>
      {meta && (
        <span className="font-mono text-muted-foreground truncate">
          {meta.variant}/{meta.topicSlug}/{meta.subtopicSlug}/{meta.iterLabel}
        </span>
      )}
    </div>
  );
}

function LessonPane({ path }: { path: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dev-lesson", path],
    queryFn: () =>
      fetch(`/api/dev/lessons/load?path=${encodeURIComponent(path)}`).then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json() as Promise<LessonData>;
      }),
    enabled: !!path,
  });

  const steps = useMemo<WhiteboardStep[]>(() => {
    const arr = data?.steps;
    return Array.isArray(arr) ? arr : [];
  }, [data]);

  // Memoize so the underlying useEffect([existingLesson]) doesn't re-run
  // every render and reset the player.
  const existingLesson = useMemo(
    () => ({ lessonContent: "", whiteboardSteps: steps }),
    [steps],
  );

  const meta = path ? parsePath(path) : null;

  if (!path) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Pick a lesson above.
      </div>
    );
  }
  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-sm">Loading…</div>;
  }
  if (isError || !steps.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-rose-600">
        Failed to load.
      </div>
    );
  }

  return (
    <div className="flex-1 relative min-h-0 min-w-0">
      <MicroLesson
        // Force fresh mount per path. (playKey isn't needed — picking the
        // same path twice is a no-op since the dropdown state matches.)
        key={path}
        topic={meta?.topicSlug || "dev"}
        subtopic={meta?.subtopicSlug || "dev"}
        metadata={DEV_METADATA}
        existingLesson={existingLesson}
        onClose={() => {
          /* no-op in compare view */
        }}
        skipPractice
        debugScrub
      />
    </div>
  );
}

function DevComparePageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const left = params.get("left") ?? "";
  const right = params.get("right") ?? "";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dev-lessons"],
    queryFn: () =>
      fetch("/api/dev/lessons").then((r) => {
        if (!r.ok) throw new Error("Failed to load lessons");
        return r.json() as Promise<{ iters: IterMeta[] }>;
      }),
    staleTime: 30_000,
  });

  const options = data?.iters ?? [];

  const setSide = useCallback(
    (side: "left" | "right", value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(side, value);
      else next.delete(side);
      router.replace(`/dev/compare?${next.toString()}`);
    },
    [params, router],
  );

  const swap = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    next.set("left", right);
    next.set("right", left);
    router.replace(`/dev/compare?${next.toString()}`);
  }, [left, right, params, router]);

  return (
    <div className="relative h-screen flex flex-col">
      <header className="border-b px-4 py-2 flex items-center justify-between gap-4 text-sm bg-background z-10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dev" className="text-blue-600 hover:underline shrink-0">
            ← dev
          </Link>
          <span className="font-semibold">Dev · Compare Lessons</span>
          <span className="text-xs text-muted-foreground truncate">
            two players, independent timelines — use each scrubber (?debug=scrub) to align manually
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={swap}
            disabled={!left && !right}
            className="px-2 py-1 rounded border text-xs disabled:opacity-50"
          >
            ⇄ swap
          </button>
        </div>
      </header>

      {isLoading && (
        <div className="p-8 text-sm text-muted-foreground">Loading lesson list…</div>
      )}
      {isError && (
        <div className="p-8 text-sm text-rose-600">
          Failed to load lesson list. Are you in dev mode?
        </div>
      )}

      {data && (
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 flex flex-col border-r min-w-0">
            <PaneHeader
              side="left"
              path={left}
              options={options}
              onPick={(v) => setSide("left", v)}
            />
            <LessonPane path={left} />
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            <PaneHeader
              side="right"
              path={right}
              options={options}
              onPick={(v) => setSide("right", v)}
            />
            <LessonPane path={right} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function DevComparePage() {
  return (
    <Suspense fallback={null}>
      <DevComparePageInner />
    </Suspense>
  );
}
