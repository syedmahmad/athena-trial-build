"use client";

type Stats = {
  totalQuestions: number;
  accuracy: number;
  totalTimeSeconds: number;
  sessionCount: number;
  avgScore: number;
};

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function StudyStats({ stats }: { stats: Stats }) {
  const avgMinutes =
    stats.sessionCount > 0
      ? Math.round(stats.totalTimeSeconds / stats.sessionCount / 60)
      : 0;

  return (
    <div className="border bg-card p-5">
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Study Stats
      </h2>
      <p className="mt-2 text-3xl font-bold tabular-nums">
        {stats.sessionCount} <span className="text-lg font-medium text-muted-foreground">Sessions</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatDuration(stats.totalTimeSeconds)} total &middot; {avgMinutes} min avg
      </p>
    </div>
  );
}
