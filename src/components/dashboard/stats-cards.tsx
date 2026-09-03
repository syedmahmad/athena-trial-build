"use client";

export function StatsCards({
  targetScore,
  sessionsCount,
}: {
  targetScore: number | null;
  sessionsCount: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="border bg-card p-4">
        <p className="text-2xl font-bold tabular-nums">
          {targetScore ?? "\u2014"}
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Target
        </p>
      </div>
      <div className="border bg-card p-4">
        <p className="text-2xl font-bold tabular-nums">{sessionsCount}</p>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sessions
        </p>
      </div>
    </div>
  );
}
