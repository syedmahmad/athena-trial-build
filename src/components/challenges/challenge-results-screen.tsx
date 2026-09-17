"use client";

import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import type { Challenge, ChallengeAttempt } from "@/types/challenges";

const CONFETTI_COLORS = ["#f59e0b", "#8b5cf6", "#22c55e", "#3b82f6", "#ec4899"];

function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 24 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute h-2 w-2 rounded-sm"
          style={{
            left: `${(i * 4.2) % 100}%`,
            backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          }}
          initial={{ y: -20, opacity: 1, rotate: 0 }}
          animate={{ y: 400, opacity: 0, rotate: 360 }}
          transition={{ duration: 1.8 + (i % 5) * 0.2, delay: (i % 8) * 0.05, ease: "easeIn" }}
        />
      ))}
    </div>
  );
}

export function ChallengeResultsScreen({
  challenge,
  attempts,
  myUserId,
}: {
  challenge: Challenge;
  attempts: ChallengeAttempt[];
  myUserId: string;
}) {
  const me = attempts.find((a) => a.userId === myUserId);
  const opponent = attempts.find((a) => a.userId !== myUserId);
  const bothSubmitted = !!me?.submittedAt && !!opponent?.submittedAt;

  if (!bothSubmitted) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-lg font-semibold">You&apos;re done!</p>
        <p className="text-sm text-muted-foreground">
          Waiting for {opponent ? "your friend" : "the other player"} to finish…
        </p>
      </div>
    );
  }

  const iWon = challenge.winnerId === myUserId;
  const isDraw = challenge.winnerId === null;
  const myName = "You";
  const opponentName = challenge.challengerId === myUserId ? challenge.opponentName : challenge.challengerName;

  return (
    <div className="relative py-8 text-center">
      {iWon && <Confetti />}

      <div className="mb-4 flex items-center justify-center">
        <div className="rounded-full bg-primary/10 p-4">
          <Trophy className={`h-10 w-10 ${iWon ? "text-amber-500" : "text-muted-foreground"}`} />
        </div>
      </div>

      <h2 className="text-2xl font-bold tracking-tight">
        {isDraw ? "It's a draw!" : iWon ? "You won!" : `${opponentName || "Your friend"} won`}
      </h2>

      <div className="mt-8 grid grid-cols-2 gap-4">
        <div
          className={`rounded-lg border p-5 ${challenge.winnerId === myUserId ? "border-athena-success bg-athena-success/10" : ""}`}
        >
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{myName}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums">{me?.score ?? 0}</p>
          <p className="text-xs text-muted-foreground">/ {challenge.questionCount} correct</p>
        </div>
        <div
          className={`rounded-lg border p-5 ${challenge.winnerId === opponent?.userId ? "border-athena-success bg-athena-success/10" : ""}`}
        >
          <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">
            {opponentName || "Opponent"}
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums">{opponent?.score ?? 0}</p>
          <p className="text-xs text-muted-foreground">/ {challenge.questionCount} correct</p>
        </div>
      </div>
    </div>
  );
}
