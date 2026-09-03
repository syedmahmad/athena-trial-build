"use client";

import { useState, useCallback, useRef } from "react";
import type { Problem } from "@/components/quiz/types";
import { stemTokens, tooSimilar } from "@/lib/stem-similarity";

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
}: UseStreamingProblemsOptions) {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");

  const problemsRef = useRef<Problem[]>([]);
  const orderCounterRef = useRef(0);
  // Cross-wave dedupe: the server dedupes within one response, but a refill
  // wave doesn't know earlier waves' content, so guard by id + stem here too.
  const seenIdsRef = useRef<Set<string>>(new Set());
  const priorStemsRef = useRef<Set<string>[]>([]);
  // Serializes waves: a refill is dropped if one is already in flight (the
  // consumer re-checks on the next advance, so nothing is lost).
  const inFlightRef = useRef(false);
  const startedRef = useRef(false);

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
  }, []);

  return {
    problems,
    phase,
    isStreaming: phase === "streaming",
    start,
    requestMore,
    reset,
  };
}
