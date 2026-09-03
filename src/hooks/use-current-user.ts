"use client";

import { useQuery } from "@tanstack/react-query";

type UserData = {
  user: {
    id: string;
    clerkId: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    skillScore: number | null;
    targetScore: number | null;
    onboardingCompleted: boolean;
    /** Access tri-state: true = full, false = homework-only, null = direct learner. */
    learningAccess: boolean | null;
    /** ISO timestamp; the free-trial deadline for direct learners (null = grandfathered). */
    trialEndsAt: string | null;
  };
  /** Positioning-flow state for the SAT surface; null once completed or never started. */
  onboarding: {
    currentStep: "plan" | "quiz" | "schedule" | "completed";
    quizQuestionIndex: number;
    lessonPreference: "view_now" | "queue_for_later" | null;
  } | null;
};

async function fetchUser(): Promise<UserData> {
  const res = await fetch("/api/user/me");
  if (res.status === 404) {
    await fetch("/api/user/sync", { method: "POST" });
    const retryRes = await fetch("/api/user/me");
    if (!retryRes.ok) throw new Error("Failed to load user data");
    return retryRes.json();
  }
  if (!res.ok) throw new Error("Failed to load user data");
  return res.json();
}

export function useCurrentUser() {
  const { data, isLoading, error, refetch } = useQuery<UserData>({
    queryKey: ["user"],
    queryFn: fetchUser,
    staleTime: 5 * 60_000,
  });

  return {
    data: data ?? null,
    loading: isLoading,
    error: error ? (error as Error).message : null,
    refetch,
  };
}
