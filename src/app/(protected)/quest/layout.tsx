"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useTodaysQuest } from "@/hooks/use-daily-quest";
import { QuestProvider } from "@/components/daily-quest/quest-provider";

export default function QuestLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Captured once on entry, same pattern as the SAT quiz layout's
  // satFocused — the SAT dashboard's Daily Quest card links here with
  // ?sat=1 so every exit path (error, no-quest, tutor) returns to
  // /sat/dashboard instead of the old /dashboard.
  const [satFocused] = useState(() => searchParams.get("sat") === "1");
  const dashboardHref = satFocused ? "/sat/dashboard" : "/dashboard";
  const { data, isLoading, isError } = useTodaysQuest();

  useEffect(() => {
    if (isError) {
      toast.error("Failed to load quest");
      router.push(dashboardHref);
    }
  }, [isError, router, dashboardHref]);

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (!data.quest || !data.problems) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-muted-foreground">No quest generated yet.</p>
        <button
          onClick={() => router.push(dashboardHref)}
          className="text-sm font-medium text-primary hover:underline"
        >
          Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <QuestProvider
      quest={data.quest}
      problems={data.problems}
      dashboardHref={dashboardHref}
    >
      {children}
    </QuestProvider>
  );
}
