"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useFriends } from "@/hooks/use-friends";
import { useCreateChallenge } from "@/hooks/use-challenges";

type Topic = {
  id: string;
  name: string;
  subject: string;
  subtopics: { id: string; name: string }[];
};

const QUESTION_COUNTS = [5, 10, 15] as const;

export function ChallengeCreateModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { friends } = useFriends();
  const { data } = useQuery<{ topics: Topic[] }>({
    queryKey: ["learning"],
    queryFn: () => fetch("/api/learning").then((r) => r.json()),
    staleTime: 600_000,
  });
  const createMutation = useCreateChallenge();

  const [opponentUserId, setOpponentUserId] = useState("");
  const [subtopicId, setSubtopicId] = useState("");
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [scheduledAt, setScheduledAt] = useState("");

  const topics = data?.topics ?? [];
  const canSubmit = useMemo(
    () => !!opponentUserId && !!subtopicId && !!scheduledAt,
    [opponentUserId, subtopicId, scheduledAt]
  );

  function handleSubmit() {
    if (!canSubmit) return;
    createMutation.mutate(
      {
        opponentUserId,
        subtopicId,
        questionCount,
        // datetime-local gives a local wall-clock string; the browser's
        // Date constructor parses it as local time, so this converts to the
        // correct UTC instant. Every later comparison uses this real
        // timestamp, never a re-derived date string.
        scheduledAt: new Date(scheduledAt).toISOString(),
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setOpponentUserId("");
          setSubtopicId("");
          setQuestionCount(5);
          setScheduledAt("");
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Challenge a friend</DialogTitle>
          <DialogDescription>
            Pick a friend, a topic, and a time. You&apos;ll both answer the
            same questions and see who wins.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Friend
            </label>
            {friends.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You don&apos;t have any friends yet — invite one first.
              </p>
            ) : (
              <select
                value={opponentUserId}
                onChange={(e) => setOpponentUserId(e.target.value)}
                className="w-full border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Select a friend…</option>
                {friends.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.displayName || "Unknown"}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Subtopic
            </label>
            <select
              value={subtopicId}
              onChange={(e) => setSubtopicId(e.target.value)}
              className="w-full border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="">Select a subtopic…</option>
              {topics.map((topic) => (
                <optgroup key={topic.id} label={topic.name}>
                  {topic.subtopics.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Number of questions
            </label>
            <div className="flex gap-2">
              {QUESTION_COUNTS.map((count) => (
                <Button
                  key={count}
                  type="button"
                  variant={questionCount === count ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setQuestionCount(count)}
                >
                  {count}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Date &amp; time
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="w-full border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Neither of you can start before this time.
            </p>
          </div>

          <Button
            className="w-full"
            disabled={!canSubmit || createMutation.isPending}
            onClick={handleSubmit}
          >
            {createMutation.isPending ? "Sending…" : "Send Challenge"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
