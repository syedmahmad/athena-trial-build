"use client";

import { useState, useEffect } from "react";
import { QueueItemCard } from "./queue-item-card";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";

type QueueItem = {
  id: string;
  lessonId: string;
  status: string;
  progressPct: number;
  lessonTitle: string;
  estimatedDuration: number;
};

export function QueueList() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/learning-queue");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setQueue(data.queue);
      } catch {
        toast.error("Failed to load learning queue");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <BookOpen className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="font-medium">No lessons in your queue</p>
        <p className="text-sm text-muted-foreground mt-1">
          Lessons are added when you answer quiz questions incorrectly.
        </p>
      </div>
    );
  }

  const pending = queue.filter((q) => q.status !== "completed");
  const completed = queue.filter((q) => q.status === "completed");

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            To review ({pending.length})
          </h2>
          {pending.map((item) => (
            <QueueItemCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Completed ({completed.length})
          </h2>
          {completed.map((item) => (
            <QueueItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
