"use client";

// Dev-only: Storybook-style gallery of every lesson step type, operation,
// and connector/animation the whiteboard renderer supports. Each story is a
// hand-crafted minimal WhiteboardStep[] fed straight into MicroLesson via
// `existingLesson` (no DB tracking, no streaming). Clicking a story bumps a
// counter used as the player's React `key` so the lesson remounts and
// replays from step 0 — even when re-clicking the same story.

import { Suspense, useMemo, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { MicroLesson } from "@/components/learning/micro-lesson";
import { STORIES, STORY_CATEGORIES, type Story } from "./stories";

const DEV_METADATA = {} as const;

function DevStoriesPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  // URL-driven active story: ?story=<id>. Falls back to STORIES[0] when
  // the param is missing or doesn't match a known story id.
  const storyParam = params.get("story");
  const activeId = useMemo(() => {
    if (storyParam && STORIES.some((s) => s.id === storyParam)) return storyParam;
    return STORIES[0]?.id ?? "";
  }, [storyParam]);
  // Bumps on every click — drives the player's `key` so the same story
  // re-clicked still remounts and replays.
  const [playKey, setPlayKey] = useState(0);
  // JSON inspector panel: collapsed by default so it doesn't compete with
  // the player on first paint. State is intentionally not persisted.
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);

  const active = useMemo(
    () => STORIES.find((s) => s.id === activeId) ?? STORIES[0],
    [activeId],
  );

  const existingLesson = useMemo(
    () => ({ lessonContent: "", whiteboardSteps: active.steps }),
    [active],
  );

  const onPlay = useCallback((s: Story) => {
    const next = new URLSearchParams(params.toString());
    next.set("story", s.id);
    // `replace` (not `push`) so the back button isn't polluted with
    // every story click.
    router.replace(`/dev/stories?${next.toString()}`);
    setPlayKey((k) => k + 1);
  }, [params, router]);

  const stepsJson = useMemo(
    () => JSON.stringify(active.steps, null, 2),
    [active],
  );

  // Reset the "Copied!" label when switching stories so it can't appear
  // stale against a different JSON payload.
  useEffect(() => {
    setCopied(false);
  }, [active.id]);

  const onCopyJson = useCallback(() => {
    void navigator.clipboard.writeText(stepsJson).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [stepsJson]);

  const grouped = useMemo(() => {
    const map = new Map<string, Story[]>();
    for (const cat of STORY_CATEGORIES) map.set(cat, []);
    for (const s of STORIES) {
      const list = map.get(s.category) ?? [];
      list.push(s);
      map.set(s.category, list);
    }
    return map;
  }, []);

  return (
    <div className="relative h-screen flex flex-col">
      <header className="border-b px-4 py-2 flex items-center justify-between gap-4 text-sm bg-background z-10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dev/lessons" className="text-blue-600 hover:underline shrink-0">
            ← eval lessons
          </Link>
          <span className="font-semibold">Dev · Step Stories</span>
          <span className="text-xs text-muted-foreground truncate">
            click a story to play it; click again to replay
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs font-mono text-muted-foreground">
            {active.category} / {active.title}
          </div>
          <button
            onClick={() => setShowJson((v) => !v)}
            className="text-xs px-2 py-1 rounded border border-border hover:bg-muted/40 transition-colors text-muted-foreground"
          >
            {showJson ? "hide JSON" : "show JSON"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-72 border-r overflow-y-auto bg-background shrink-0">
          {STORY_CATEGORIES.map((cat) => {
            const list = grouped.get(cat) ?? [];
            if (list.length === 0) return null;
            return (
              <div key={cat} className="border-b">
                <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {cat}
                </div>
                <ul>
                  {list.map((s) => {
                    const isActive = s.id === activeId;
                    return (
                      <li key={s.id}>
                        <button
                          onClick={() => onPlay(s)}
                          className={`w-full text-left px-3 py-2 text-sm border-l-2 transition-colors ${
                            isActive
                              ? "border-blue-500 bg-blue-500/10"
                              : "border-transparent hover:bg-muted/40"
                          }`}
                        >
                          <div className="font-medium">{s.title}</div>
                          <div className="text-xs text-muted-foreground line-clamp-2">
                            {s.description}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </aside>

        <div className="flex-1 relative min-w-0">
          <MicroLesson
            key={`${active.id}:${playKey}`}
            topic="dev"
            subtopic="stories"
            metadata={DEV_METADATA}
            existingLesson={existingLesson}
            onClose={() => setPlayKey((k) => k + 1)}
            skipPractice
          />
        </div>

        {showJson && (
          <aside className="w-96 border-l overflow-y-auto bg-background shrink-0 flex flex-col">
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b shrink-0 sticky top-0 bg-background z-10">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                whiteboardSteps · {active.steps.length}
              </span>
              <button
                onClick={onCopyJson}
                className="text-xs px-2 py-1 rounded border border-border hover:bg-muted/40 transition-colors text-muted-foreground"
              >
                {copied ? "Copied!" : "copy"}
              </button>
            </div>
            <pre className="flex-1 px-3 py-2 text-[11px] leading-snug font-mono text-foreground whitespace-pre overflow-x-auto">
              {stepsJson}
            </pre>
          </aside>
        )}
      </div>
    </div>
  );
}

export default function DevStoriesPage() {
  return (
    <Suspense fallback={null}>
      <DevStoriesPageInner />
    </Suspense>
  );
}
