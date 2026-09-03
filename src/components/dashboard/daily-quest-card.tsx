"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Swords, Sparkles, CheckCircle2, Zap } from "lucide-react";
import { useTodaysQuest } from "@/hooks/use-daily-quest";

export function DailyQuestCard() {
  const { data, isLoading } = useTodaysQuest();

  if (isLoading) {
    return <div className="h-32 bg-muted animate-pulse rounded-lg" />;
  }

  const quest = data?.quest;

  // Quest still loading/generating (auto-generated on GET)
  if (!quest) {
    return (
      <div className="relative border-2 border-muted-foreground/20 bg-gradient-to-b from-muted/50 to-transparent px-6 py-8 text-center rounded-lg">
        <Swords className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-lg font-semibold text-muted-foreground">
          Preparing your quest...
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Your adaptive daily quest is being generated
        </p>
      </div>
    );
  }

  // Quest completed
  if (quest.status === "completed") {
    const accuracy = quest.totalQuestions > 0
      ? Math.round((quest.correctCount / quest.totalQuestions) * 100)
      : 0;

    return (
      <div className="group relative overflow-hidden p-[3px] border border-green-500/20 transition-shadow duration-300 hover:shadow-[0_0_12px_0_rgba(34,197,94,0.15)]">
        {/* Rotating conic gradient — hidden by default, visible on hover */}
        <div
          className="pointer-events-none absolute inset-0 animate-[border-rotate_4s_linear_infinite] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              "conic-gradient(from 0deg, rgba(34,197,94,0.06), rgba(34,197,94,0.3), rgba(74,222,128,0.55), rgba(34,197,94,0.3), rgba(34,197,94,0.06), rgba(34,197,94,0.04), rgba(34,197,94,0.04), rgba(34,197,94,0.04), rgba(34,197,94,0.06))",
          }}
        />
        {/* Inner content */}
        <div className="relative bg-card px-6 py-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
            <div>
              <p className="font-semibold">Quest Complete!</p>
              <p className="text-sm text-muted-foreground">
                {quest.correctCount}/{quest.totalQuestions} correct ({accuracy}%)
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1 text-athena-amber">
              <Zap className="h-4 w-4" />
              <span className="font-bold">+{quest.xpEarned} XP</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Quest ready (pending) or in progress
  const answered = data?.problems?.filter(
    (p: { isCorrect: boolean | null }) => p.isCorrect !== null
  ).length ?? 0;
  const progress = Math.round((answered / quest.totalQuestions) * 100);

  return (
    <Link href="/quest">
      <motion.div
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className="relative border-2 border-athena-amber/30 bg-gradient-to-b from-athena-amber/5 to-transparent px-6 py-8 cursor-pointer text-center rounded-lg"
      >
        <Sparkles className="absolute right-4 top-4 h-4 w-4 text-athena-amber/30" />
        <Swords className="mx-auto mb-3 h-8 w-8 text-primary" />
        <p className="text-lg font-semibold">Daily Quest</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {answered > 0
            ? `${answered}/${quest.totalQuestions} answered · ${progress}% done`
            : `${quest.totalQuestions} adaptive questions tailored to you`}
        </p>
        {answered > 0 && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          {answered > 0 ? "Continue quest →" : "Begin quest →"}
        </p>
      </motion.div>
    </Link>
  );
}
