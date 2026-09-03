import { Calendar, Clock } from "lucide-react";

export function ReportHeader({
  topicName,
  subtopicName,
  generatedAt,
  durationSeconds,
}: {
  topicName: string;
  subtopicName: string;
  generatedAt: string;
  durationSeconds: number | null;
}) {
  const date = new Date(generatedAt);
  const dateLabel = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const durationLabel = formatDuration(durationSeconds);

  return (
    <header className="flex flex-col gap-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-athena-amber">
        {topicName}
      </p>
      <h1 className="text-3xl font-semibold leading-tight text-foreground">
        {subtopicName}
      </h1>
      <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          {dateLabel}
        </span>
        {durationLabel ? (
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {durationLabel}
          </span>
        ) : null}
      </div>
    </header>
  );
}

function formatDuration(seconds: number | null): string | null {
  if (seconds == null || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}
