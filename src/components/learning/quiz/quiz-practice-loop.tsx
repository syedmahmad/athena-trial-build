"use client";

import { useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PracticeWhiteboard } from "@/components/learning/practice/practice-whiteboard";
import type { Problem } from "@/components/quiz/types";

type QuizPracticeLoopProps = {
  topicSlug: string;
  subtopicSlug: string;
  difficulty?: string;
  onComplete: () => void;
  onNeedsMicroLesson: () => void;
};

export function QuizPracticeLoop({
  topicSlug,
  subtopicSlug,
  difficulty,
  onComplete,
  onNeedsMicroLesson,
}: QuizPracticeLoopProps) {
  const sessionKey = useRef(Date.now()).current;
  const [problemIndex, setProblemIndex] = useState(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["quiz-practice-loop", topicSlug, subtopicSlug, difficulty, sessionKey],
    queryFn: () => {
      const url = `/api/learning/${topicSlug}/${subtopicSlug}/practice-problems${difficulty ? `?difficulty=${encodeURIComponent(difficulty)}` : ""}`;
      return fetch(url).then((r) => {
        if (!r.ok) throw new Error("Failed to load practice problems");
        return r.json() as Promise<{ problems: Problem[] }>;
      });
    },
    staleTime: 0,
  });

  const problems = (data?.problems ?? []).slice(0, 2);
  const currentProblem = problems[problemIndex];

  // Practice is a 2-problem loop. On the first correct answer we advance
  // to the second problem; only the LAST correct answer exits the loop
  // back to the main quiz. Mirrors `post-lesson-practice.tsx`.
  const handleCorrect = useCallback(() => {
    if (problemIndex < problems.length - 1) {
      setProblemIndex((i) => i + 1);
    } else {
      onComplete();
    }
  }, [problemIndex, problems.length, onComplete]);

  const handleExhausted = useCallback(() => {
    if (problemIndex === 0 && problems.length > 1) {
      setProblemIndex(1);
    } else {
      onNeedsMicroLesson();
    }
  }, [problemIndex, problems.length, onNeedsMicroLesson]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <motion.div
          animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Sparkles className="h-8 w-8 text-athena-amber" />
        </motion.div>
        <p className="text-sm text-muted-foreground">Preparing practice problems…</p>
      </div>
    );
  }

  if (isError || problems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <p className="text-sm text-destructive">Could not load practice problems.</p>
        <Button variant="outline" size="sm" onClick={onComplete}>
          Skip Practice
        </Button>
      </div>
    );
  }

  if (!currentProblem) return null;

  // No outer AnimatePresence on problem change — PracticeWhiteboardContent
  // already cross-fades the canvas and the bottom pane has its own
  // transition. See post-lesson-practice.tsx for the same fix.
  return (
    <div className="h-full">
      <PracticeWhiteboard
        problem={currentProblem}
        questionNumber={problemIndex + 1}
        totalProblems={problems.length}
        onCorrect={handleCorrect}
        onExhausted={handleExhausted}
        onBack={onComplete}
      />
    </div>
  );
}
