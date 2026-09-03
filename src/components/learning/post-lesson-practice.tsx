"use client";

import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { useStreamingProblems } from "@/hooks/use-streaming-problems";
import { Button } from "@/components/ui/button";
import { Sparkles, CheckCircle, XCircle, ChevronRight } from "lucide-react";
import { PracticeWhiteboard } from "@/components/learning/practice/practice-whiteboard";
import { LessonCongratsScreen } from "@/components/learning/lesson-congrats-screen";
import type { Problem } from "@/components/quiz/types";

type PostLessonPracticeProps = {
  topic: string;
  subtopic: string;
  subject?: "math" | "reading-writing";
  /** Pool linkage for streamed problems — enables seeded-serving + write-through
   *  + no-repeat. Without it the loop still streams fresh problems, just
   *  ephemerally (not persisted/tracked). */
  subtopicId?: string;
  customTopicId?: string;
  topicSlug?: string;
  subtopicSlug?: string;
  onComplete: () => void;
  maxProblems?: number;
  /** When true, calls onComplete automatically after the last problem (no summary screen). */
  autoComplete?: boolean;
  /** When provided, skip the API call and use these problems directly. */
  problems?: Problem[];
  /** Optional metadata for the congrats screen (shown when autoComplete is false). */
  topicName?: string;
  subtopicName?: string;
  lessonType?: "micro-lesson" | "quiz";
  learningObjectives?: string[];
  keyFormulas?: { latex: string; description: string }[];
};

export function PostLessonPractice({
  topic,
  subtopic,
  subject = "math",
  subtopicId,
  customTopicId,
  topicSlug,
  subtopicSlug,
  onComplete,
  maxProblems,
  autoComplete = false,
  problems: providedProblems,
  topicName,
  subtopicName,
  lessonType,
  learningObjectives,
  keyFormulas,
}: PostLessonPracticeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const {
    problems: streamedProblems,
    phase: streamPhase,
    start: startStream,
  } = useStreamingProblems({
    topic,
    subtopic,
    subject,
    subtopicId,
    customTopicId,
    topicSlug,
    subtopicSlug,
  });

  // Open the single wave once, unless problems were supplied directly. The
  // pool size mirrors how many we'll actually show — the first problem lands
  // in a few seconds and the rest stream in behind it.
  useEffect(() => {
    if (providedProblems) return;
    startStream({ count: maxProblems ?? 6 });
  }, [providedProblems, maxProblems, startStream]);

  const allProblems = providedProblems ?? streamedProblems;
  const problems = maxProblems != null ? allProblems.slice(0, maxProblems) : allProblems;
  const totalProblems = problems.length;
  // Provided problems are complete immediately; a streamed pool is complete
  // only once the stream finishes. Gating the done path on this keeps the
  // loop from ending early if the student catches up to a still-growing tail.
  const generationComplete =
    providedProblems != null ||
    streamPhase === "complete" ||
    streamPhase === "error";
  const isDone =
    generationComplete && totalProblems > 0 && currentIndex >= totalProblems;

  // Auto-navigate when in exposure mode (no summary needed)
  useEffect(() => {
    if (isDone && autoComplete) {
      onComplete();
    }
  }, [isDone, autoComplete, onComplete]);

  const advance = useCallback(() => {
    setCurrentIndex((i) => i + 1);
  }, []);

  const handleCorrect = useCallback(() => {
    setCorrectCount((c) => c + 1);
    advance();
  }, [advance]);

  // Spinner only until the FIRST problem arrives; after that we render
  // problems as they continue to stream in.
  const awaitingFirst =
    !providedProblems && totalProblems === 0 && streamPhase !== "error";
  if (awaitingFirst) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <motion.div
          animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Sparkles className="h-8 w-8 text-athena-amber" />
        </motion.div>
        <p className="text-sm text-muted-foreground">
          Preparing practice problems…
        </p>
      </div>
    );
  }

  if ((!providedProblems && streamPhase === "error") || problems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <p className="text-sm text-destructive">
          Could not load practice problems.
        </p>
        <Button variant="outline" size="sm" onClick={onComplete}>
          Skip Practice
        </Button>
      </div>
    );
  }

  // Congrats / summary screen (shown only when autoComplete is false)
  if (isDone) {
    if (topicName && subtopicName && lessonType) {
      return (
        <LessonCongratsScreen
          topicName={topicName}
          subtopicName={subtopicName}
          lessonType={lessonType}
          score={{ correct: correctCount, total: totalProblems }}
          learningObjectives={learningObjectives}
          keyFormulas={keyFormulas}
          onDone={onComplete}
        />
      );
    }

    // Fallback: simple summary if no metadata props provided
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center"
      >
        <div className="flex flex-col items-center gap-2">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
          >
            {correctCount === totalProblems ? (
              <CheckCircle className="h-16 w-16 text-green-500" />
            ) : (
              <XCircle className="h-16 w-16 text-athena-amber" />
            )}
          </motion.div>
          <h3 className="text-xl font-semibold">
            {correctCount}/{totalProblems} correct
          </h3>
          <p className="text-sm text-muted-foreground">
            {correctCount === totalProblems
              ? "Perfect! Great work."
              : "Keep practicing, you are making progress!"}
          </p>
        </div>
        <Button onClick={onComplete} className="gap-2">
          Done
          <ChevronRight className="h-4 w-4" />
        </Button>
      </motion.div>
    );
  }

  const currentProblem = problems[currentIndex];
  if (!currentProblem) {
    // Student outran generation — the next problem is still in flight.
    // Brief wait; the stream will append it and advance totalProblems.
    if (!generationComplete) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
          <motion.div
            animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.15, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <Sparkles className="h-8 w-8 text-athena-amber" />
          </motion.div>
          <p className="text-sm text-muted-foreground">
            Generating the next problem…
          </p>
        </div>
      );
    }
    return null;
  }

  // No outer AnimatePresence on problem change — PracticeWhiteboardContent
  // already cross-fades the canvas (keyed on problem.id) and the bottom
  // pane has its own y-translate transition. Wrapping both in another
  // opacity fade stacks two animations and visibly shifts the layout
  // mid-transition. The lastProblemId prop-as-state pattern inside the
  // content resets internal state when the problem prop changes.
  return (
    <div className="h-full">
      <PracticeWhiteboard
        problem={currentProblem}
        questionNumber={currentIndex + 1}
        totalProblems={totalProblems}
        onCorrect={handleCorrect}
        onExhausted={advance}
        onBack={onComplete}
      />
    </div>
  );
}
