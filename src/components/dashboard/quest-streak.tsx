"use client";

import { cn } from "@/lib/utils";

type StreakDay = {
  day: string;
  completed: boolean;
  isPast: boolean;
};

export function QuestStreak({
  streak,
  days,
}: {
  streak: number;
  days: StreakDay[];
}) {
  return (
    <div className="border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quest Streak
        </h3>
        <span className="text-xs text-muted-foreground">&middot;</span>
        <span className="text-xs font-bold text-athena-amber">
          Day {streak}
        </span>
        <span className="text-xs">🔥</span>
      </div>
      <div className="flex items-center gap-2">
        {days.map((d, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <div
              className={cn(
                "h-2 w-full rounded-full",
                d.completed
                  ? "bg-athena-amber"
                  : d.isPast
                    ? "bg-muted-foreground/20"
                    : "border border-dashed border-muted-foreground/30 bg-transparent"
              )}
            />
            <span
              className={cn(
                "text-[10px] font-medium",
                d.completed ? "text-athena-amber" : "text-muted-foreground/50"
              )}
            >
              {d.day}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
