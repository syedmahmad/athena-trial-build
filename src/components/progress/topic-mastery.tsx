"use client";

import { cn } from "@/lib/utils";

type MasteryData = {
  items: {
    name: string;
    mastered: boolean;
    attempted: boolean;
  }[];
  masteredCount: number;
  totalCount: number;
};

export function TopicMastery({ mastery }: { mastery: MasteryData }) {
  return (
    <div className="border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Topic Mastery
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {mastery.masteredCount}/{mastery.totalCount}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {mastery.items.map((item) => (
          <span
            key={item.name}
            className={cn(
              "inline-block px-3 py-1.5 text-xs font-medium border",
              item.mastered
                ? "border-foreground/20 text-foreground"
                : "border-transparent text-muted-foreground/40"
            )}
          >
            {item.name}
          </span>
        ))}
      </div>
    </div>
  );
}
