"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { MicroLesson } from "@/components/learning/micro-lesson";
import { getWrapUp } from "@/lib/wrap-ups";
import type { Problem } from "@/components/quiz/types";
import { WhiteboardSkeleton } from "@/components/whiteboard/whiteboard-skeleton";
import { GenerationProgress } from "@/components/lessons/generation-progress";

/** Shuffle a problem's answer options, keeping `correctOption` pointed
 *  at the option whose text was originally correct. The hardcoded set
 *  authors `correctOption: 0` for every problem; without shuffling the
 *  student would always pick the first option once they noticed the
 *  pattern. Fisher–Yates over a fresh array so the source data isn't
 *  mutated. */
function shuffleProblemOptions(p: Problem): Problem {
  const correctText = p.options[p.correctOption];
  const order = p.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const shuffled = order.map((i) => p.options[i]);
  return {
    ...p,
    options: shuffled,
    correctOption: shuffled.indexOf(correctText),
  };
}

const HARDCODED_PROBLEMS: Problem[] = [
  {
    id: "hardcoded-linear-eq-1",
    orderIndex: 0,
    difficulty: "medium",
    questionText:
      "The equation y = -2x - 1 is graphed in the xy-plane. What is the slope and y-intercept of the line?",
    options: [
      "Slope: -2, y-intercept: -1",
      "Slope: -1, y-intercept: -2",
      "Slope: 2, y-intercept: -1",
      "Slope: -2, y-intercept: 1",
    ],
    correctOption: 0,
    explanation:
      "In the slope-intercept form y = mx + b, the coefficient of x is the slope (m = -2) and the constant term is the y-intercept (b = -1).",
    solutionSteps: [
      { step: 1, instruction: "Identify the slope-intercept form", math: "y = mx + b" },
      { step: 2, instruction: "Read off the slope", math: "m = -2" },
      { step: 3, instruction: "Read off the y-intercept", math: "b = -1" },
    ],
    hint: "Compare the equation to the slope-intercept form y = mx + b.",
    timeRecommendationSeconds: 30,
  },
  {
    id: "hardcoded-linear-eq-2",
    orderIndex: 1,
    difficulty: "medium",
    questionText:
      "The equation y = 5x + 5 is graphed in the xy-plane. At what point does the line cross the x-axis?",
    options: ["(-1, 0)", "(0, 5)", "(1, 0)", "(5, 0)"],
    correctOption: 0,
    explanation:
      "The line crosses the x-axis when y = 0. Setting 0 = 5x + 5 and solving gives x = -1, so the x-intercept is (-1, 0).",
    solutionSteps: [
      { step: 1, instruction: "Set y = 0 to find the x-intercept", math: "0 = 5x + 5" },
      { step: 2, instruction: "Subtract 5 from both sides", math: "-5 = 5x" },
      { step: 3, instruction: "Divide both sides by 5", math: "x = -1" },
    ],
    hint: "The x-axis is where y = 0. Plug that in and solve for x.",
    timeRecommendationSeconds: 45,
  },
];

function MicroLessonPageInner() {
  const params = useParams<{ topicSlug: string; subtopicSlug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  // debug flags can be comma-combined, e.g. ?debug=ops,freeze
  const debugFlags = new Set((searchParams.get("debug") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const debugOps = debugFlags.has("ops");
  const freezeCanvas = debugFlags.has("freeze");
  const debugScrub = debugFlags.has("scrub");
  const noirCanvas = debugFlags.has("v2");
  const corkboardCanvas = debugFlags.has("v3");
  const debugOrb = debugFlags.has("orb");
  // Launched from the SAT brand surface — restores SAT prompt framing and
  // returns there on close.
  const satSurface = searchParams.get("sat") === "1";
  const { topicSlug, subtopicSlug } = params;

  // Once we start generating locally, stop polling so the refetch
  // doesn't unmount MicroLesson by switching to the "generating" spinner.
  const generatingLocallyRef = useRef(false);

  // Shuffle the hardcoded practice problems' answer positions ONCE per
  // page mount so the correct answer isn't always at index 0. Re-mounts
  // get a fresh shuffle; same-mount re-renders keep the same order.
  const shuffledHardcodedProblems = useMemo(
    () => HARDCODED_PROBLEMS.map(shuffleProblemOptions),
    [],
  );

  // Force dark mode on <html> for this route so the whiteboard's
  // useIsDarkMode() hook activates and its elements adapt their colors.
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    if (!hadDark) root.classList.add("dark");
    return () => {
      if (!hadDark) root.classList.remove("dark");
    };
  }, []);

  // Opt-in: ?debug=ops paints dashed outlines around the four op-* roles
  // the AI tagged on LaTeX spans. Only active while the URL has the flag.
  useEffect(() => {
    if (!debugOps) return;
    const root = document.documentElement;
    root.classList.add("debug-ops");
    return () => {
      root.classList.remove("debug-ops");
    };
  }, [debugOps]);

  const {
    data,
    isLoading: metaLoading,
    isError: metaError,
  } = useQuery({
    queryKey: ["learning", topicSlug, subtopicSlug],
    queryFn: () =>
      fetch(`/api/learning/${topicSlug}/${subtopicSlug}`).then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      }),
    staleTime: 600_000,
    // Static topic/subtopic metadata — no need to refetch on focus, and it
    // keeps the lesson page from re-rendering mid-lesson on tab switches.
    refetchOnWindowFocus: false,
  });

  const {
    data: storedLesson,
    isLoading: lessonLoading,
    isError: lessonError,
  } = useQuery({
    queryKey: ["micro-lesson", topicSlug, subtopicSlug],
    queryFn: () =>
      fetch(`/api/learning/${topicSlug}/${subtopicSlug}/micro-lesson`).then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      }),
    staleTime: 0,
    // Do NOT refetch when the window regains focus. With staleTime:0 a focus
    // refetch hands MicroLesson a fresh whiteboardSteps/existingLesson object
    // mid-lesson, which remounts the step player — skipping questions to the
    // done/practice view and resetting the practice-problem fetch. Generation
    // polling is unaffected (it uses refetchInterval below, not focus).
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      if (generatingLocallyRef.current) return false;
      return query.state.data?.status === "generating" ? 3000 : false;
    },
  });

  useEffect(() => {
    if (metaError) toast.error("Failed to load subtopic");
  }, [metaError]);

  useEffect(() => {
    if (lessonError) toast.error("Failed to load lesson");
  }, [lessonError]);

  if (metaLoading || lessonLoading) {
    return (
      <div className="dark observation-record flex items-center justify-center h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--obs-border)] border-t-[var(--obs-glow-mid)]" />
      </div>
    );
  }

  if (!data) return null;

  // Another client is currently generating — show polling spinner
  // (but not if we're the one generating)
  if (storedLesson?.status === "generating" && !generatingLocallyRef.current) {
    return (
      <div className="dark observation-record flex flex-col h-screen">
        <div className="flex items-center justify-center py-6">
          <GenerationProgress />
        </div>
        <div className="flex-1 min-h-0">
          <WhiteboardSkeleton className="h-full" />
        </div>
      </div>
    );
  }

  const { topic, subtopic } = data;

  // Silent, caption-free wrap-up video + its narration timeline (spoken
  // live in the chosen tutor voice). See src/lib/wrap-ups.ts.
  const wrapUp = getWrapUp(subtopicSlug);

  // Determine existing lesson: ready rows pass content; null/stale/error → generate
  const existingLesson =
    storedLesson?.status === "ready"
      ? { lessonContent: storedLesson.lessonContent, whiteboardSteps: storedLesson.whiteboardSteps }
      : null;

  // If no existing lesson, we'll generate locally — stop polling
  if (!existingLesson) {
    generatingLocallyRef.current = true;
  }

  return (
    <div className="dark">
    <MicroLesson
      topic={topic.name}
      subtopic={subtopic.name}
      metadata={{
        description: subtopic.description,
        learningObjectives: subtopic.learningObjectives,
        keyFormulas: subtopic.keyFormulas,
        commonMistakes: subtopic.commonMistakes,
        tipsAndTricks: subtopic.tipsAndTricks,
        conceptualOverview: subtopic.conceptualOverview,
        ...(satSurface ? { satFocused: true } : {}),
      }}
      existingLesson={existingLesson}
      subtopicApiPath={`/api/learning/${topicSlug}/${subtopicSlug}/micro-lesson`}
      practiceMode={{ subject: "math" }}
      practiceProblems={
        subtopicSlug === "linear-equations-two-variables"
          ? shuffledHardcodedProblems
          : undefined
      }
      wrapUpVideoUrl={wrapUp?.videoUrl}
      wrapUpNarration={wrapUp?.beats}
      introVideoUrl={
        subtopicSlug === "linear-equations-two-variables"
          ? "/intros/linear-equations-two-variables.mp4"
          : undefined
      }
      ambientMusicUrl="/audio/lesson-ambient.mp3"
      onClose={() => router.push(satSurface ? "/sat/dashboard" : "/dashboard")}
      tracking={storedLesson?.id ? { microLessonId: storedLesson.id, subtopicId: storedLesson.subtopicId ?? data.subtopic.id } : undefined}
      freezeCanvas={freezeCanvas}
      debugScrub={debugScrub}
      noirCanvas={noirCanvas}
      corkboardCanvas={corkboardCanvas}
      debugOrb={debugOrb}
    />
    </div>
  );
}

export default function MicroLessonPage() {
  return (
    <Suspense
      fallback={
        <div className="dark observation-record flex h-[calc(100vh-4rem)] items-center justify-center">
          <WhiteboardSkeleton />
        </div>
      }
    >
      <MicroLessonPageInner />
    </Suspense>
  );
}
