"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect } from "react";

export function useTodaysQuest() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["daily-quest"],
    queryFn: async () => {
      const res = await fetch("/api/daily-quest");
      if (!res.ok) throw new Error("Failed to fetch quest");
      return res.json();
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isError) toast.error("Failed to load today's quest");
  }, [isError]);

  return { data, isLoading, isError, refetch };
}

export function useGenerateQuest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/daily-quest/generate", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to generate quest");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-quest"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useAnswerQuestProblem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      questProblemId: string;
      questId: string;
      selectedOption: number;
      isCorrect: boolean;
      responseTimeMs: number;
      subtopicId: string;
      difficultyLevel: number;
    }) => {
      const res = await fetch("/api/daily-quest/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to record answer");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-quest"] });
    },
  });
}

export function useCompleteQuest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      questId: string;
      timeElapsedSeconds: number;
    }) => {
      const res = await fetch("/api/daily-quest/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to complete quest");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-quest"] });
      queryClient.invalidateQueries({ queryKey: ["progress"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
    onError: () => {
      toast.error("Failed to complete quest");
    },
  });
}
