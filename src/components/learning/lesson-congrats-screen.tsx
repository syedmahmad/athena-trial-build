"use client";

import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ChevronRight, CheckCircle } from "lucide-react";
import PixelCharacter from "@/components/shared/PixelCharacter";
import { DownloadReportButton } from "@/components/reports/download-report-button";
import type { MicroLessonSnapshot } from "@/lib/reports/types";

type LessonCongratsScreenProps = {
  topicName: string;
  subtopicName: string;
  lessonType: "micro-lesson" | "quiz";
  score?: { correct: number; total: number };
  learningObjectives?: string[];
  keyFormulas?: { latex: string; description: string }[];
  reportSessionId?: string | null;
  reportSnapshot?: MicroLessonSnapshot;
  onDone: () => void;
};

type LessonSummary = {
  greeting: string;
  summary: string;
  takeaways: string[];
  encouragement: string;
};

function Confetti() {
  const colors = [
    "hsl(var(--green))",
    "hsl(var(--blue))",
    "hsl(var(--yellow))",
    "hsl(var(--pink))",
    "hsl(var(--orange))",
  ];
  const particles = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.5,
        size: 3 + Math.random() * 4,
        color: colors[i % colors.length],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            bottom: "40%",
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
          }}
          initial={{ y: 0, opacity: 1 }}
          animate={{
            y: -220 - Math.random() * 140,
            opacity: [1, 1, 0],
            x: (Math.random() - 0.5) * 100,
          }}
          transition={{
            duration: 1.4 + Math.random() * 0.5,
            delay: p.delay,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

export function LessonCongratsScreen({
  topicName,
  subtopicName,
  lessonType,
  score,
  learningObjectives,
  keyFormulas,
  reportSessionId,
  reportSnapshot,
  onDone,
}: LessonCongratsScreenProps) {
  const {
    mutate,
    data: summary,
    isPending,
    isError,
  } = useMutation({
    mutationFn: async (): Promise<LessonSummary> => {
      const res = await fetch("/api/lesson-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicName,
          subtopicName,
          lessonType,
          score,
          learningObjectives,
          keyFormulas,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate summary");
      return res.json();
    },
  });

  useEffect(() => {
    mutate();
  }, [mutate]);

  const fallback: LessonSummary = {
    greeting: "Great work!",
    summary: `You just completed a lesson on ${subtopicName}.`,
    takeaways: learningObjectives?.slice(0, 3) ?? [
      "You covered the key concepts.",
    ],
    encouragement: "Keep going — every lesson makes you stronger!",
  };

  const content = isError ? fallback : summary;

  // Loading state
  if (isPending && !content) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
        >
          <PixelCharacter emotion="thinking" isTalking={false} size={80} />
        </motion.div>
        <motion.p
          className="text-sm text-muted-foreground"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          Athena is thinking...
        </motion.p>
      </div>
    );
  }

  const display = content ?? fallback;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative flex flex-col items-center justify-center h-full gap-6 p-8 text-center"
    >
      <Confetti />

      {/* Character */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
      >
        <PixelCharacter emotion="excited" isTalking={false} size={80} />
      </motion.div>

      {/* Greeting */}
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-2xl font-bold"
      >
        {display.greeting}
      </motion.h2>

      {/* Summary */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="text-muted-foreground max-w-md"
      >
        {display.summary}
      </motion.p>

      {/* Score badge */}
      {score && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.45, type: "spring", stiffness: 200, damping: 15 }}
          className="flex items-center gap-2 rounded-full bg-athena-success/10 px-4 py-2"
        >
          <CheckCircle className="h-5 w-5 text-athena-success" />
          <span className="font-semibold text-athena-success">
            {score.correct}/{score.total} correct
          </span>
        </motion.div>
      )}

      {/* Takeaways */}
      <div className="flex flex-col gap-2 text-left max-w-sm w-full">
        {display.takeaways.map((takeaway, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 + i * 0.1 }}
            className="flex items-start gap-2 text-sm"
          >
            <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-athena-amber shrink-0" />
            <span className="text-muted-foreground">{takeaway}</span>
          </motion.div>
        ))}
      </div>

      {/* Encouragement */}
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="text-sm font-medium text-athena-amber"
      >
        {display.encouragement}
      </motion.p>

      {/* Action row: download report (optional) + Done */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.95 }}
        className="flex items-center gap-3"
      >
        {reportSessionId ? (
          <DownloadReportButton
            kind={lessonType}
            sessionId={reportSessionId}
            snapshot={lessonType === "micro-lesson" ? reportSnapshot : undefined}
            variant="outline"
          />
        ) : null}
        <Button onClick={onDone} className="gap-2">
          Done
          <ChevronRight className="h-4 w-4" />
        </Button>
      </motion.div>
    </motion.div>
  );
}
