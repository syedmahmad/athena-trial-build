"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

export function useMyLearningTopic(topicId: string | null) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-learning-topic", topicId],
    queryFn: () =>
      fetch(`/api/my-learning/topics/${topicId}`).then((r) => {
        if (!r.ok) throw new Error("Failed to load topic");
        return r.json();
      }),
    staleTime: 10 * 60_000,
    enabled: !!topicId,
  });

  useEffect(() => {
    if (isError) toast.error("Failed to load topic");
  }, [isError]);

  return { data, isLoading, isError };
}
