"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect } from "react";
import type {
  FullSatStatusResponse,
  FullSatStartResponse,
  FullSatSubmitResponse,
  FullSatHistoryResponse,
} from "@/types/full-sat";

export function useFullSatStatus() {
  const { data, isLoading, isError, refetch } = useQuery<FullSatStatusResponse>({
    queryKey: ["full-sat"],
    queryFn: async () => {
      const res = await fetch("/api/full-sat");
      if (!res.ok) throw new Error("Failed to fetch full SAT status");
      return res.json();
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isError) toast.error("Failed to load full SAT status");
  }, [isError]);

  return { data, isLoading, isError, refetch };
}

export function useStartFullSat() {
  const queryClient = useQueryClient();

  return useMutation<FullSatStartResponse, Error, { testId: string }>({
    mutationFn: async ({ testId }) => {
      const res = await fetch("/api/full-sat/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to start test");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["full-sat"] });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });
}

export function useAnswerFullSat() {
  return useMutation({
    mutationFn: async (payload: {
      attemptId: string;
      problemId: string;
      section: string;
      module: number;
      orderIndex: number;
      selectedOption: number;
      isCorrect: boolean;
      responseTimeMs?: number;
    }) => {
      const res = await fetch("/api/full-sat/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to record answer");
      return res.json();
    },
  });
}

export function useSubmitFullSat() {
  const queryClient = useQueryClient();

  return useMutation<
    FullSatSubmitResponse,
    Error,
    { attemptId: string; rwTimeSeconds: number; mathTimeSeconds: number }
  >({
    mutationFn: async (payload) => {
      const res = await fetch("/api/full-sat/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to submit test");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["full-sat"] });
      queryClient.invalidateQueries({ queryKey: ["progress"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
    onError: () => {
      toast.error("Failed to submit test");
    },
  });
}

export function useFullSatHistory() {
  const { data, isLoading, isError } = useQuery<FullSatHistoryResponse>({
    queryKey: ["full-sat-history"],
    queryFn: async () => {
      const res = await fetch("/api/full-sat/history");
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isError) toast.error("Failed to load test history");
  }, [isError]);

  return { data, isLoading, isError };
}
