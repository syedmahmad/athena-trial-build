"use client";

import { Clock } from "lucide-react";

function formatTime(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function DailyStudyReminder({ time }: { time: string | null }) {
  if (!time) return null;

  return (
    <div className="flex items-center gap-3 border bg-card px-5 py-3">
      <Clock className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">
        Your daily study time:{" "}
        <span className="font-medium text-foreground">{formatTime(time)}</span>
      </span>
    </div>
  );
}
