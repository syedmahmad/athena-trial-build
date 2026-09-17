"use client";

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ChallengesListResponse, ChallengeDetailResponse } from "@/types/challenges";

export function useChallenges() {
  const { data, isLoading, isError } = useQuery<ChallengesListResponse>({
    queryKey: ["challenges"],
    queryFn: async () => {
      const res = await fetch("/api/challenges");
      if (!res.ok) throw new Error("Failed to load challenges");
      return res.json();
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (isError) toast.error("Failed to load challenges");
  }, [isError]);

  return {
    incoming: data?.incoming ?? [],
    outgoing: data?.outgoing ?? [],
    scheduled: data?.scheduled ?? [],
    completed: data?.completed ?? [],
    isLoading,
  };
}

export function useChallenge(challengeId: string | undefined) {
  const { data, isLoading, isError, refetch } = useQuery<ChallengeDetailResponse>({
    queryKey: ["challenges", challengeId],
    queryFn: async () => {
      const res = await fetch(`/api/challenges/${challengeId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to load challenge");
      }
      return res.json();
    },
    enabled: !!challengeId,
    // Poll only before the quiz content has loaded (waiting on accept, or
    // waiting on the scheduled start time) — no notification infra exists,
    // so this is how "it's time now" gets picked up without a manual
    // refresh. Stop once `problems` is present: polling while someone is
    // actively answering questions adds exactly the concurrent-request
    // pressure that trips the Supabase-auth-refresh race documented in
    // proxy.ts (GoTrue's "too many concurrent token refresh" limit), which
    // manifests as the whole page silently hard-reloading mid-quiz and
    // losing in-progress answers — the same failure mode as the original
    // "SAT quiz keeps reloading" bug. `submitChallengeAttempt`'s own
    // `invalidateQueries` already forces one refetch right after submit.
    refetchInterval: (query) => (query.state.data?.problems ? false : 15_000),
  });

  useEffect(() => {
    if (isError) toast.error("Failed to load challenge");
  }, [isError]);

  return { data, isLoading, isError, refetch };
}

export function useCreateChallenge() {
  const queryClient = useQueryClient();

  return useMutation<
    { challengeId: string },
    Error,
    { opponentUserId: string; subtopicId: string; questionCount: number; scheduledAt: string }
  >({
    mutationFn: async (payload) => {
      const res = await fetch("/api/challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to create challenge");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Challenge sent!");
      queryClient.invalidateQueries({ queryKey: ["challenges"] });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useRespondToChallenge(challengeId: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, { action: "accept" | "decline" }>({
    mutationFn: async (payload) => {
      const res = await fetch(`/api/challenges/${challengeId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to respond to challenge");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["challenges"] });
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useSubmitChallenge(challengeId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    { score: number },
    Error,
    { answers: { problemId: string; selectedOption: number }[]; timeElapsedSeconds: number }
  >({
    mutationFn: async (payload) => {
      const res = await fetch(`/api/challenges/${challengeId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to submit challenge");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["challenges"] });
      queryClient.invalidateQueries({ queryKey: ["challenges", challengeId] });
    },
    onError: (err) => toast.error(err.message),
  });
}
