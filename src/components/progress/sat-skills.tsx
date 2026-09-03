"use client";

import { cn } from "@/lib/utils";

type TopicData = {
  name: string;
  slug: string;
  subject: string;
  total: number;
  correct: number;
  accuracy: number;
};

export function SatSkills({ topics }: { topics: TopicData[] }) {
  return (
    <div className="border bg-card p-5 h-full">
      <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Skills
      </h2>
      <div className="space-y-0">
        {topics.map((topic) => (
          <div
            key={topic.slug}
            className="flex items-center justify-between border-b border-border/40 py-2.5 last:border-0"
          >
            <span
              className={cn(
                "text-sm font-medium",
                topic.total === 0 && "text-muted-foreground"
              )}
            >
              {topic.name}
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {topic.total > 0 ? `${topic.correct}/${topic.total}` : "\u2014"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
