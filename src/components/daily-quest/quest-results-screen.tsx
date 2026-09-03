"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Trophy, Zap, Clock, Target, ArrowRight } from "lucide-react";
import { useQuestContext } from "./quest-context";

export function QuestResultsScreen() {
  const router = useRouter();
  const ctx = useQuestContext();

  const accuracy = ctx.problems.length > 0
    ? Math.round((ctx.score / ctx.problems.length) * 100)
    : 0;

  const minutes = Math.floor(ctx.elapsed / 60);
  const seconds = ctx.elapsed % 60;

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", duration: 0.5 }}
        className="w-full max-w-md space-y-8"
      >
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Trophy className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Quest Complete!</h1>
          <p className="mt-1 text-muted-foreground">
            {accuracy >= 80
              ? "Outstanding performance!"
              : accuracy >= 60
                ? "Good effort, keep pushing!"
                : "Every quest makes you stronger."}
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border bg-card p-4 text-center">
            <Target className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-2xl font-bold">{ctx.score}/{ctx.problems.length}</p>
            <p className="text-xs text-muted-foreground">Correct</p>
          </div>
          <div className="rounded-lg border bg-card p-4 text-center">
            <div className="mx-auto mb-2 text-lg font-bold text-primary">{accuracy}%</div>
            <p className="text-2xl font-bold">&nbsp;</p>
            <p className="text-xs text-muted-foreground">Accuracy</p>
          </div>
          <div className="rounded-lg border bg-card p-4 text-center">
            <Clock className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
            <p className="text-2xl font-bold">{minutes}:{seconds.toString().padStart(2, "0")}</p>
            <p className="text-xs text-muted-foreground">Time</p>
          </div>
          <div className="rounded-lg border bg-card p-4 text-center">
            <Zap className="mx-auto mb-2 h-5 w-5 text-athena-amber" />
            <p className="text-2xl font-bold text-athena-amber">+{ctx.xpEarned}</p>
            <p className="text-xs text-muted-foreground">XP Earned</p>
          </div>
        </div>

        {/* Bucket breakdown */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Performance by Focus</h3>
          {(["weak", "mid", "stretch"] as const).map((bucket) => {
            const bucketProblems = ctx.problems.filter((p) => p.bucket === bucket);
            if (bucketProblems.length === 0) return null;
            const correct = bucketProblems.filter((p) => p.isCorrect).length;
            const label =
              bucket === "weak" ? "Weak Areas" : bucket === "mid" ? "Mid Level" : "Stretch";
            return (
              <div key={bucket} className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm">{label}</span>
                <span className="text-sm font-medium">
                  {correct}/{bucketProblems.length}
                </span>
              </div>
            );
          })}
        </div>

        {/* Action */}
        <button
          onClick={() => router.push("/dashboard")}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Back to Dashboard
          <ArrowRight className="h-4 w-4" />
        </button>
      </motion.div>
    </div>
  );
}
