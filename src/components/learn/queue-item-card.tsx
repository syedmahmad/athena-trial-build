"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Clock, CheckCircle2, BookOpen, Circle } from "lucide-react";

type QueueItem = {
  id: string;
  lessonId: string;
  status: string;
  progressPct: number;
  lessonTitle: string;
  estimatedDuration: number;
};

export function QueueItemCard({ item }: { item: QueueItem }) {
  const statusIcon = {
    completed: <CheckCircle2 className="h-4 w-4 text-athena-success" />,
    in_progress: <BookOpen className="h-4 w-4 text-athena-amber" />,
    pending: <Circle className="h-4 w-4 text-muted-foreground" />,
  }[item.status] ?? <Circle className="h-4 w-4 text-muted-foreground" />;

  const statusLabel = {
    completed: "Completed",
    in_progress: `${item.progressPct}% done`,
    pending: "Not started",
  }[item.status] ?? "Pending";

  return (
    <Link href={`/queue/${item.lessonId}`}>
      <Card
        className={cn(
          "transition-colors hover:bg-accent/50 cursor-pointer",
          item.status === "completed" && "opacity-70"
        )}
      >
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            {statusIcon}
            <div>
              <p className="text-sm font-medium">{item.lessonTitle}</p>
              <p className="text-xs text-muted-foreground">{statusLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {item.estimatedDuration} min
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
