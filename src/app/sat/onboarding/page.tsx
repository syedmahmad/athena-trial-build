"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-current-user";
import { ProgressStepper } from "@/components/sat/onboarding/progress-stepper";

export default function OnboardingPage() {
  const router = useRouter();
  const { data, loading } = useCurrentUser();

  useEffect(() => {
    if (loading || !data) return;

    if (data.user.onboardingCompleted) {
      router.replace("/sat/dashboard");
      return;
    }

    const step = data.onboarding?.currentStep ?? "plan";
    if (step === "plan") {
      router.replace("/sat/onboarding/plan");
    } else if (step === "quiz") {
      router.replace("/sat/onboarding/quiz");
    } else if (step === "schedule") {
      router.replace("/sat/onboarding/schedule");
    } else if (step === "completed") {
      router.replace("/sat/onboarding/complete");
    }
  }, [data, loading, router]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-8 pt-12">
        <ProgressStepper currentStep="quiz" />
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span>Setting things up...</span>
        </div>
      </div>
    );
  }

  return null;
}
