"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Trophy, BookOpen, Calculator, Clock, ArrowRight } from "lucide-react";
import type { FullSatSubmitResponse } from "@/types/full-sat";

export default function FullSatResultsPage() {
  const router = useRouter();
  const params = useParams<{ attemptId: string }>();
  const [results, setResults] = useState<FullSatSubmitResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try to get results from the attempt history
    async function fetchResults() {
      try {
        const res = await fetch("/api/full-sat/history");
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        const attempt = data.attempts?.find(
          (a: any) => a.id === params.attemptId
        );
        if (attempt && attempt.status === "completed") {
          setResults({
            rwRawScore: attempt.rwRawScore ?? 0,
            rwScaledScore: attempt.rwScaledScore ?? 0,
            mathRawScore: attempt.mathRawScore ?? 0,
            mathScaledScore: attempt.mathScaledScore ?? 0,
            totalScore: attempt.totalScore ?? 0,
          });
        }
      } catch {
        // Results may be passed via query state from submit
      } finally {
        setLoading(false);
      }
    }
    fetchResults();
  }, [params.attemptId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (!results) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-muted-foreground">Results not available yet.</p>
        <button
          onClick={() => router.push("/full-sat")}
          className="text-sm font-medium text-primary hover:underline"
        >
          Back to Full SAT
        </button>
      </div>
    );
  }

  const scoreColor =
    results.totalScore >= 1200
      ? "text-green-500"
      : results.totalScore >= 900
        ? "text-amber-500"
        : "text-red-500";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background overflow-auto">
      <div className="mx-auto max-w-2xl px-4 py-12 w-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="mb-4 flex items-center justify-center">
            <div className="rounded-full bg-primary/10 p-4">
              <Trophy className="h-10 w-10 text-amber-500" />
            </div>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            SAT Practice Test Complete
          </h1>
        </motion.div>

        {/* Total score */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-8 text-center"
        >
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
            Total Score
          </p>
          <p className={`text-6xl font-bold tabular-nums mt-2 ${scoreColor}`}>
            {results.totalScore}
          </p>
          <p className="text-sm text-muted-foreground mt-1">out of 1600</p>
        </motion.div>

        {/* Section breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          {/* R&W */}
          <div className="rounded-lg border bg-card p-5 text-center">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-3">
              <BookOpen className="h-4 w-4" />
              Reading &amp; Writing
            </div>
            <p className="text-3xl font-bold tabular-nums">
              {results.rwScaledScore}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {results.rwRawScore}/54 correct
            </p>
            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${(results.rwScaledScore / 800) * 100}%` }}
              />
            </div>
          </div>

          {/* Math */}
          <div className="rounded-lg border bg-card p-5 text-center">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-3">
              <Calculator className="h-4 w-4" />
              Math
            </div>
            <p className="text-3xl font-bold tabular-nums">
              {results.mathScaledScore}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {results.mathRawScore}/44 correct
            </p>
            <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-purple-500 transition-all"
                style={{ width: `${(results.mathScaledScore / 800) * 100}%` }}
              />
            </div>
          </div>
        </motion.div>

        {/* Score interpretation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-8 rounded-lg border bg-card p-5"
        >
          <h3 className="text-sm font-semibold mb-2">Score Breakdown</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>R&amp;W Raw Score</span>
              <span className="font-medium text-foreground">
                {results.rwRawScore} / 54
              </span>
            </div>
            <div className="flex justify-between">
              <span>R&amp;W Scaled Score</span>
              <span className="font-medium text-foreground">
                {results.rwScaledScore} / 800
              </span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span>Math Raw Score</span>
              <span className="font-medium text-foreground">
                {results.mathRawScore} / 44
              </span>
            </div>
            <div className="flex justify-between">
              <span>Math Scaled Score</span>
              <span className="font-medium text-foreground">
                {results.mathScaledScore} / 800
              </span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold text-foreground">
              <span>Total</span>
              <span>{results.totalScore} / 1600</span>
            </div>
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-8 flex flex-col gap-3 sm:flex-row"
        >
          <button
            onClick={() => router.push("/full-sat")}
            className="flex-1 rounded-md border px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            Back to Full SAT
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Dashboard
            <ArrowRight className="h-4 w-4" />
          </button>
        </motion.div>
      </div>
    </div>
  );
}
