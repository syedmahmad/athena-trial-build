"use client";

import { useRouter } from "next/navigation";
import { useFullSatStatus, useStartFullSat, useFullSatHistory } from "@/hooks/use-full-sat";
import { motion } from "framer-motion";
import { Clock, Trophy, Lock, ArrowRight, ChevronLeft } from "lucide-react";

function formatDaysUntil(dateString: string): string {
  const diff = new Date(dateString).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Available now";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export default function FullSatLandingPage() {
  const router = useRouter();
  const { data: status, isLoading } = useFullSatStatus();
  const { data: history } = useFullSatHistory();
  const startMutation = useStartFullSat();

  if (isLoading || !status) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  const handleStart = async (testId: string) => {
    const result = await startMutation.mutateAsync({ testId });
    router.push(`/full-sat/${result.attemptId}`);
  };

  const handleResume = () => {
    if (status.currentAttempt) {
      router.push(`/full-sat/${status.currentAttempt.id}`);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <button
        onClick={() => router.push("/dashboard")}
        className="mb-6 flex items-center gap-1.5 text-base text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
        Dashboard
      </button>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold tracking-tight">Full SAT Practice Test</h1>
        <p className="mt-2 text-muted-foreground">
          Take a complete SAT practice test with 98 questions across Reading &amp; Writing and Math.
          Timed sections, real SAT scoring (400-1600).
        </p>
      </motion.div>

      {/* Cooldown notice */}
      {!status.canTakeTest && status.nextAvailableDate && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-6 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3"
        >
          <Lock className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-medium">Cooldown Active</p>
            <p className="text-xs text-muted-foreground">
              Next test available in {formatDaysUntil(status.nextAvailableDate)}
            </p>
          </div>
        </motion.div>
      )}

      {/* Resume in-progress */}
      {status.currentAttempt && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-6"
        >
          <button
            onClick={handleResume}
            className="w-full rounded-lg border-2 border-primary bg-primary/5 px-6 py-4 text-left transition-colors hover:bg-primary/10"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Resume In-Progress Test</p>
                <p className="text-sm text-muted-foreground">
                  Started {new Date(status.currentAttempt.startedAt).toLocaleDateString()}
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-primary" />
            </div>
          </button>
        </motion.div>
      )}

      {/* Available tests */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Available Tests
        </h2>
        {status.tests.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No tests available yet. Tests will appear here once the problem bank is seeded.
          </p>
        ) : (
          status.tests.map((test) => (
            <motion.div
              key={test.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border bg-card p-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{test.name}</h3>
                  <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      134 min
                    </span>
                    <span>98 questions</span>
                    <span>R&amp;W + Math</span>
                  </div>
                </div>
                <button
                  onClick={() => handleStart(test.id)}
                  disabled={!status.canTakeTest || !!status.currentAttempt || startMutation.isPending}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {startMutation.isPending ? "Starting..." : "Start"}
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Past attempts */}
      {history?.attempts && history.attempts.length > 0 && (
        <div className="mt-10 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Past Attempts
          </h2>
          {history.attempts
            .filter((a) => a.status === "completed")
            .map((attempt) => (
              <div
                key={attempt.id}
                className="rounded-lg border bg-card p-4 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium">
                    {new Date(attempt.completedAt!).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>R&amp;W: {attempt.rwScaledScore}</span>
                    <span>Math: {attempt.mathScaledScore}</span>
                    <span>
                      Time: {Math.round(attempt.totalTimeSeconds / 60)}m
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <span className="text-lg font-bold tabular-nums">
                    {attempt.totalScore}
                  </span>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
