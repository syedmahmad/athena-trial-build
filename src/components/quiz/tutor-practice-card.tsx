"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { PracticePane } from "@/components/learning/practice/practice-whiteboard";
import { useQuestionNarration, stripTtsNoise } from "@/hooks/use-question-narration";
import type { Problem } from "@/components/quiz/types";

// Confetti pulse for the canvas-level "Correct!" overlay. Mirrors the
// in-lesson check-in / predict / fill_blank correct feedback so practice
// feedback feels continuous with the rest of the lesson surface.
function CorrectConfetti() {
  const colors = [
    "hsl(var(--green))",
    "hsl(var(--blue))",
    "hsl(var(--yellow))",
    "hsl(var(--pink))",
    "hsl(var(--orange))",
  ];
  const particles = Array.from({ length: 14 }, (_, i) => ({
    id: i,
    x: 50 + (Math.random() - 0.5) * 30,
    delay: Math.random() * 0.4,
    size: 3 + Math.random() * 3,
    color: colors[i % colors.length],
  }));
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: "50%",
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
          }}
          initial={{ y: 0, opacity: 1 }}
          animate={{
            y: -180 - Math.random() * 120,
            opacity: [1, 1, 0],
            x: (Math.random() - 0.5) * 80,
          }}
          transition={{
            duration: 1.2 + Math.random() * 0.4,
            delay: p.delay,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

type TutorPracticeCardProps = {
  practiceProblemsUrl?: string;
  difficulty?: string;
  onComplete: () => void;
  onNeedsMicroLesson: () => void;
  onCurrentProblemChange?: (problem: Problem | null) => void;
};

export function TutorPracticeCard({
  practiceProblemsUrl,
  difficulty,
  onComplete,
  onNeedsMicroLesson,
  onCurrentProblemChange,
}: TutorPracticeCardProps) {
  const sessionKey = useRef(Date.now()).current;
  const [problemIndex, setProblemIndex] = useState(0);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["tutor-practice-card", practiceProblemsUrl, difficulty, sessionKey],
    queryFn: () => {
      if (!practiceProblemsUrl) return Promise.resolve({ problems: [] });
      const url = `${practiceProblemsUrl}${difficulty ? `?difficulty=${encodeURIComponent(difficulty)}` : ""}`;
      return fetch(url).then((r) => {
        if (!r.ok) throw new Error("Failed to load practice problems");
        return r.json() as Promise<{ problems: Problem[] }>;
      });
    },
    enabled: !!practiceProblemsUrl,
    staleTime: 0,
  });

  const problems = (data?.problems ?? []).slice(0, 2);
  const currentProblem = problems[problemIndex];

  // Drives the canvas-level "Correct!" pulse. Set when the student
  // selects the correct option; cleared when the problem index advances
  // (next problem) or the loop completes. Lives at the card level so
  // the overlay can render outside the floating card panel and onto the
  // background whiteboard canvas where the student is looking.
  const [revealedCorrect, setRevealedCorrect] = useState(false);

  useEffect(() => {
    onCurrentProblemChange?.(currentProblem ?? null);
  }, [currentProblem, onCurrentProblemChange]);

  // Reset the correct-pulse when the active problem changes so it
  // doesn't bleed across questions.
  useEffect(() => {
    setRevealedCorrect(false);
  }, [currentProblem?.id]);

  // Auto-play TTS for each new practice problem. Prefer the model-authored
  // phonetic narration; fall back to a runtime LaTeX strip of questionText
  // for rows that haven't been backfilled yet. Question is marked
  // interruptible so PracticePane's phase-change cancel cuts it the
  // moment the student answers.
  const { play: playQuestion, cancel: cancelQuestion } = useQuestionNarration();
  useEffect(() => {
    if (!currentProblem) {
      cancelQuestion();
      return;
    }
    const phonetic =
      currentProblem.questionPhonetic?.trim() ||
      stripTtsNoise(currentProblem.questionText || "").trim();
    if (phonetic) playQuestion(phonetic, { interruptible: true });
    // playQuestion / cancelQuestion are stable (useCallback inside the
    // hook); deps key on the problem id so we re-fire only when the
    // active question actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProblem?.id]);

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

  return (
    <>
    {/* Canvas-level "Correct!" pulse. Bug fix: previously the inline
        "Correct!" indicator rendered inside the floating practice card
        panel (under the answer buttons), but the student is looking at
        the whiteboard canvas behind the card. We render the pulse as a
        viewport-fixed overlay centered over the canvas region (between
        the top toolbar and the bottom chat bar) so the feedback lands
        where attention already is. Mirrors the in-lesson check-in /
        predict / fill_blank correct pulses (spring stiffness 400 /
        damping 15 + confetti). */}
    <AnimatePresence>
      {revealedCorrect ? (
        <motion.div
          key="practice-correct-pulse"
          className="fixed inset-0 z-[61] flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="relative flex items-center justify-center w-[420px] h-[260px]">
            <CorrectConfetti />
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
              className="relative z-10 flex items-center gap-2 rounded-full border border-green-500/40 bg-green-500/15 px-5 py-2.5 shadow-lg shadow-green-500/25 backdrop-blur-md"
            >
              <Check className="h-5 w-5 text-green-500" />
              <span className="text-base font-bold text-green-500">
                Correct!
              </span>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ type: "spring", stiffness: 400, damping: 30, delay: 0.1 }}
      className="fixed top-20 left-6 z-[61]"
    >
      {/* Compact floating panel — observation-themed but flat. The
          floating tutor chat occupies the rest of the viewport, so we
          can't fit the full canvas+orb practice surface here. The pane
          shows the question text inline + the standard option grid +
          reveal feedback, all on the obs-surface palette so it reads
          as part of the same observation system. */}
      <div className="observation-record w-[360px] rounded-xl border border-[var(--obs-border)] bg-[var(--obs-surface)] backdrop-blur-md shadow-lg overflow-hidden max-h-[calc(100vh-200px)] overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 p-8">
            <motion.div
              animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.15, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              <Sparkles className="h-6 w-6 text-athena-amber" />
            </motion.div>
            <p className="text-xs text-[var(--obs-muted)]">
              Preparing practice problems…
            </p>
          </div>
        ) : !practiceProblemsUrl || isError || problems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-8">
            {(isError || (!practiceProblemsUrl && !isLoading)) && (
              <p className="text-xs text-[var(--obs-muted)]">
                No practice problems available.
              </p>
            )}
            <Button variant="outline" size="sm" onClick={onComplete}>
              Skip Practice
            </Button>
          </div>
        ) : currentProblem ? (
          <div className="px-4 py-3">
            <PracticePane
              problem={currentProblem}
              questionNumber={problemIndex + 1}
              totalProblems={problems.length}
              onCorrect={handleCorrect}
              onExhausted={handleExhausted}
              onRevealedCorrect={() => setRevealedCorrect(true)}
              showQuestionInPane
            />
          </div>
        ) : null}
      </div>
    </motion.div>
    </>
  );
}
