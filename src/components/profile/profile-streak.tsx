"use client";

import { QuestStreak } from "@/components/dashboard/quest-streak";

type StreakDay = {
  day: string;
  completed: boolean;
  isPast: boolean;
};

export function ProfileStreak({
  streak,
  bestStreak,
  weeklyStreakDays,
}: {
  streak: number;
  bestStreak: number;
  weeklyStreakDays: StreakDay[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-6">
        <div>
          <p className="text-2xl font-bold">{streak} days</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Current Streak
          </p>
        </div>
        <div>
          <p className="text-2xl font-bold">{bestStreak} days</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Best Streak
          </p>
        </div>
      </div>
      <QuestStreak streak={streak} days={weeklyStreakDays} />
    </div>
  );
}
