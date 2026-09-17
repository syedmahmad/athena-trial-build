"use client";

import Link from "next/link";
import { Swords, Trophy, Clock } from "lucide-react";
import { useChallenges } from "@/hooks/use-challenges";
import { useCurrentUser } from "@/hooks/use-current-user";

export function ChallengesCard() {
  const { incoming, scheduled, completed, isLoading } = useChallenges();
  const { data: userData } = useCurrentUser();
  const myUserId = userData?.user.id;

  if (isLoading) {
    return <div className="h-24 animate-pulse rounded-lg bg-muted" />;
  }

  if (incoming.length > 0) {
    const c = incoming[0];
    return (
      <Link href="/challenges?sat=1" className="block">
        <div className="relative border-2 border-primary/40 bg-primary/5 px-5 py-4 rounded-lg">
          <div className="flex items-center gap-3">
            <Swords className="h-6 w-6 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {c.challengerName || "A friend"} challenged you!
              </p>
              <p className="text-xs text-muted-foreground">
                {c.questionCount} questions on {c.subtopicName} — tap to respond
              </p>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  if (scheduled.length > 0) {
    const c = scheduled[0];
    const ready = Date.now() >= new Date(c.scheduledAt).getTime();
    return (
      <Link href={`/challenges/${c.id}?sat=1`} className="block">
        <div className="border bg-card px-5 py-4 rounded-lg transition-colors hover:bg-muted/50">
          <div className="flex items-center gap-3">
            {ready ? (
              <Swords className="h-6 w-6 text-primary shrink-0" />
            ) : (
              <Clock className="h-6 w-6 text-muted-foreground shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {ready ? "Challenge ready!" : "Challenge scheduled"}
              </p>
              <p className="text-xs text-muted-foreground">
                {c.questionCount} questions on {c.subtopicName} —{" "}
                {ready ? "start now" : new Date(c.scheduledAt).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  if (completed.length > 0) {
    const c = completed[0];
    const otherName = c.challengerId === myUserId ? c.opponentName : c.challengerName;
    return (
      <Link href="/challenges?sat=1" className="block">
        <div className="border bg-card px-5 py-4 rounded-lg transition-colors hover:bg-muted/50">
          <div className="flex items-center gap-3">
            <Trophy className={`h-6 w-6 shrink-0 ${c.winnerId ? "text-amber-500" : "text-muted-foreground"}`} />
            <div className="min-w-0">
              <p className="text-sm font-semibold">Last challenge result</p>
              <p className="text-xs text-muted-foreground">
                vs {otherName || "a friend"} on {c.subtopicName}
              </p>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href="/challenges?sat=1" className="block">
      <div className="border bg-card px-5 py-4 rounded-lg transition-colors hover:bg-muted/50">
        <div className="flex items-center gap-3">
          <Swords className="h-6 w-6 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-semibold">Challenge a friend</p>
            <p className="text-xs text-muted-foreground">Compete head-to-head on a quiz</p>
          </div>
        </div>
      </div>
    </Link>
  );
}
