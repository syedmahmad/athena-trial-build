"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Problem } from "@/components/quiz/types";
import { stemTokens, tooSimilar } from "@/lib/stem-similarity";
import { loadQuizProgress, saveQuizProgress, clearQuizProgress } from "@/components/learning/quiz/quiz-progress-storage";

type Phase = "idle" | "streaming" | "complete" | "error";

export type PriorAnswer = { isCorrect: boolean; difficulty?: string };

type UseStreamingProblemsOptions = {
  topic: string;
  subtopic: string;
  subject?: "math" | "reading-writing" | "general";
  /** Defaults to /api/agent/practice-problems/stream. */
  streamUrl?: string;
  /** Pool linkage — picks which seeded problems are served and where
   *  write-through inserts land. Provide the most specific available:
   *  subtopicId (SAT), customTopicId (my-learning), or the topic/subtopic
   *  slug pair. */
  subtopicId?: string;
  customTopicId?: string;
  topicSlug?: string;
  subtopicSlug?: string;
  /** Lesson/topic id forwarded for Majordomo dashboard tagging. */
  lessonId?: string;
  /** When provided, the problem pool is restored from (and persisted to)
   *  sessionStorage under this key — survives a stray hard reload without
   *  losing the student's place or regenerating a new random set. Omit for
   *  the previous behavior (always starts fresh). */
  storageKey?: string;
};

type RequestArgs = {
  count?: number;
  priorAnswers?: PriorAnswer[];
};

/**
 * Streams freshly generated practice problems into a growing array. The first
 * problem lands in a few seconds; the rest fill in behind it. Call `start()`
 * once to open the initial wave, then `requestMore()` to append further waves
 * (passing `priorAnswers` to bias difficulty — the adaptive seam).
 *
 * Server problem ids reset per wave, so each appended problem is restamped
 * with a hook-local counter to stay globally unique — the quiz state machine
 * keys on `problem.id`.
 */
export function useStreamingProblems({
  topic,
  subtopic,
  subject = "math",
  streamUrl,
  subtopicId,
  customTopicId,
  topicSlug,
  subtopicSlug,
  lessonId,
  storageKey,
}: UseStreamingProblemsOptions) {
  // Lazy-init: restore a persisted pool (if any) so a stray hard reload
  // resumes instead of regenerating a brand-new random set. Runs once, on
  // mount only — safe to read sessionStorage here despite "use client"
  // since useState initializers never execute during SSR.
  const restored = useState(() =>
    storageKey ? loadQuizProgress(storageKey) : null
  )[0];

  const [problems, setProblems] = useState<Problem[]>(
    () => restored?.problems ?? []
  );
  const [phase, setPhase] = useState<Phase>(
    () => (restored?.streamPhase as Phase | undefined) ?? "idle"
  );

  const problemsRef = useRef<Problem[]>(restored?.problems ?? []);
  const orderCounterRef = useRef(restored?.problems.length ?? 0);
  // Cross-wave dedupe: the server dedupes within one response, but a refill
  // wave doesn't know earlier waves' content, so guard by id + stem here too.
  const seenIdsRef = useRef<Set<string>>(
    new Set(restored?.problems.map((p) => p.id) ?? [])
  );
  const priorStemsRef = useRef<Set<string>[]>([]);
  // Serializes waves: a refill is dropped if one is already in flight (the
  // consumer re-checks on the next advance, so nothing is lost).
  const inFlightRef = useRef(false);
  // Restoring a non-empty pool means `start()` already ran in a prior
  // (pre-reload) mount — treat it as already-started so the caller's
  // unconditional `start({count})` effect is a no-op instead of layering a
  // second stream on top of the restored one.
  const startedRef = useRef((restored?.problems.length ?? 0) > 0);

  const runStream = useCallback(
    async (args: RequestArgs) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setPhase("streaming");

      try {
        const res = await fetch(
          streamUrl ?? "/api/agent/practice-problems/stream",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              topic,
              subtopic,
              subject,
              count: args.count ?? 6,
              priorAnswers: args.priorAnswers ?? [],
              subtopicId,
              customTopicId,
              topicSlug,
              subtopicSlug,
              lessonId,
            }),
          }
        );

        if (!res.ok || !res.body) throw new Error("Stream failed");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let sawError = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data) as {
                problem?: Problem;
                error?: string;
                done?: boolean;
              };
              if (parsed.problem) {
                const incoming = parsed.problem;
                // Keep the server's real UUID — it's the problems.id that the
                // quiz_answers / event FKs reference on save. Dedupe by id +
                // stem across waves (the server only dedupes within one wave).
                if (incoming.id && seenIdsRef.current.has(incoming.id)) continue;
                const tokens = stemTokens(incoming.questionText);
                if (tooSimilar(tokens, priorStemsRef.current)) continue;
                if (incoming.id) seenIdsRef.current.add(incoming.id);
                priorStemsRef.current.push(tokens);
                const orderIndex = orderCounterRef.current;
                orderCounterRef.current += 1;
                const stamped: Problem = { ...incoming, orderIndex };
                problemsRef.current = [...problemsRef.current, stamped];
                setProblems(problemsRef.current);
              } else if (parsed.error) {
                sawError = true;
              }
            } catch (e) {
              // Partial JSON across chunk boundaries — the tail is preserved
              // in `buffer` and reparsed on the next read.
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }

        setPhase(
          sawError && problemsRef.current.length === 0 ? "error" : "complete"
        );
      } catch {
        // A wave failing after we already have problems isn't fatal — keep
        // what we have. Only surface "error" when we have nothing to show.
        setPhase(problemsRef.current.length === 0 ? "error" : "complete");
      } finally {
        inFlightRef.current = false;
      }
    },
    [
      topic,
      subtopic,
      subject,
      streamUrl,
      subtopicId,
      customTopicId,
      topicSlug,
      subtopicSlug,
      lessonId,
    ]
  );

  /** Open the first wave. Idempotent — safe to call from an effect. */
  const start = useCallback(
    (args?: RequestArgs) => {
      if (startedRef.current) return;
      startedRef.current = true;
      void runStream({ count: args?.count ?? 6, priorAnswers: args?.priorAnswers });
    },
    [runStream]
  );

  /** Append another wave. No-op while a wave is already streaming. */
  const requestMore = useCallback(
    (args?: RequestArgs) => {
      void runStream({ count: args?.count ?? 5, priorAnswers: args?.priorAnswers });
    },
    [runStream]
  );

  const reset = useCallback(() => {
    problemsRef.current = [];
    orderCounterRef.current = 0;
    seenIdsRef.current = new Set();
    priorStemsRef.current = [];
    startedRef.current = false;
    inFlightRef.current = false;
    setProblems([]);
    setPhase("idle");
    if (storageKey) clearQuizProgress(storageKey);
  }, [storageKey]);

  // Persist the pool as it grows. Merges into whatever `useQuizState` has
  // already written under the same key (answers/index/etc.) rather than
  // overwriting it — the two hooks share one storage key but own disjoint
  // fields of the same record.
  useEffect(() => {
    if (!storageKey) return;
    const existing = loadQuizProgress(storageKey);
    saveQuizProgress(storageKey, {
      answers: [],
      markedIds: [],
      currentIndex: 0,
      phase: "active",
      wrongCounts: [],
      questionPhases: [],
      ...existing,
      problems,
      streamPhase: phase,
    });
  }, [storageKey, problems, phase]);

  return {
    problems,
    phase,
    isStreaming: phase === "streaming",
    start,
    requestMore,
    reset,
  };
}
