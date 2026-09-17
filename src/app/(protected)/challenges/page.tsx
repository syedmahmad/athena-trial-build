"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Swords, Trophy, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChallenges, useRespondToChallenge } from "@/hooks/use-challenges";
import { useCurrentUser } from "@/hooks/use-current-user";
import { ChallengeCreateModal } from "@/components/challenges/challenge-create-modal";
import type { Challenge } from "@/types/challenges";

function RespondRow({ challenge }: { challenge: Challenge }) {
  const respond = useRespondToChallenge(challenge.id);
  return (
    <div className="flex items-center justify-between rounded-lg border bg-card p-4">
      <div>
        <p className="text-sm font-medium">{challenge.challengerName || "Someone"} challenged you</p>
        <p className="text-xs text-muted-foreground">
          {challenge.questionCount} questions on {challenge.subtopicName} ·{" "}
          {new Date(challenge.scheduledAt).toLocaleString()}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={respond.isPending}
          onClick={() => respond.mutate({ action: "accept" })}
        >
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={respond.isPending}
          onClick={() => respond.mutate({ action: "decline" })}
        >
          Decline
        </Button>
      </div>
    </div>
  );
}

function ChallengeRow({
  challenge,
  myUserId,
  onClick,
  right,
}: {
  challenge: Challenge;
  myUserId: string | undefined;
  onClick: () => void;
  right: React.ReactNode;
}) {
  const otherName =
    challenge.challengerId === myUserId ? challenge.opponentName : challenge.challengerName;
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">vs {otherName || "friend"}</p>
        <p className="text-xs text-muted-foreground">
          {challenge.questionCount} questions on {challenge.subtopicName}
        </p>
      </div>
      {right}
    </button>
  );
}

export default function ChallengesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const satFocused = searchParams.get("sat") === "1";
  const dashboardHref = satFocused ? "/sat/dashboard" : "/dashboard";
  const satQuery = satFocused ? "?sat=1" : "";

  const { incoming, outgoing, scheduled, completed, isLoading } = useChallenges();
  const { data: userData } = useCurrentUser();
  const myUserId = userData?.user.id;
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <button
        onClick={() => router.push(dashboardHref)}
        className="mb-6 flex items-center gap-1.5 text-base text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
        Dashboard
      </button>

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Challenges</h1>
          <p className="mt-1 text-muted-foreground">Compete with friends head-to-head.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Swords className="h-4 w-4" />
          Challenge a friend
        </Button>
      </div>

      {isLoading ? (
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
      ) : (
        <div className="space-y-8">
          {incoming.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Invitations
              </h2>
              <div className="space-y-3">
                {incoming.map((c) => (
                  <RespondRow key={c.id} challenge={c} />
                ))}
              </div>
            </section>
          )}

          {(scheduled.length > 0 || outgoing.length > 0) && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Scheduled
              </h2>
              <div className="space-y-3">
                {scheduled.map((c) => (
                  <ChallengeRow
                    key={c.id}
                    challenge={c}
                    myUserId={myUserId}
                    onClick={() => router.push(`/challenges/${c.id}${satQuery}`)}
                    right={
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(c.scheduledAt).toLocaleString()}
                      </div>
                    }
                  />
                ))}
                {outgoing.map((c) => (
                  <div key={c.id} className="rounded-lg border bg-card p-4 opacity-60">
                    <p className="text-sm font-medium">Waiting for {c.opponentName || "your friend"} to respond</p>
                    <p className="text-xs text-muted-foreground">
                      {c.questionCount} questions on {c.subtopicName}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {completed.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Completed
              </h2>
              <div className="space-y-3">
                {completed.map((c) => {
                  const winnerName =
                    c.winnerId === myUserId
                      ? "You"
                      : c.winnerId === c.challengerId
                        ? c.challengerName
                        : c.winnerId === c.opponentId
                          ? c.opponentName
                          : null;
                  return (
                    <ChallengeRow
                      key={c.id}
                      challenge={c}
                      myUserId={myUserId}
                      onClick={() => router.push(`/challenges/${c.id}${satQuery}`)}
                      right={
                        <div className="flex items-center gap-1.5 text-xs">
                          <Trophy className={`h-3.5 w-3.5 ${c.winnerId ? "text-amber-500" : "text-muted-foreground"}`} />
                          <span className="text-muted-foreground">
                            {c.winnerId ? `${winnerName || "Winner"} won` : "Draw"}
                          </span>
                        </div>
                      }
                    />
                  );
                })}
              </div>
            </section>
          )}

          {incoming.length === 0 &&
            scheduled.length === 0 &&
            outgoing.length === 0 &&
            completed.length === 0 && (
              <div className="rounded-lg border bg-card p-8 text-center">
                <Swords className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No challenges yet. Challenge a friend to a quiz!
                </p>
              </div>
            )}
        </div>
      )}

      <ChallengeCreateModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
