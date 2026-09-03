"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LessonViewer } from "@/components/lessons/lesson-viewer";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import type { LessonContent } from "@/lib/lesson-types";

type Lesson = {
  id: string;
  title: string;
  content: LessonContent;
  estimatedDurationMinutes: number;
};

export default function LessonPage() {
  const params = useParams<{ lessonId: string }>();
  const router = useRouter();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/lessons/${params.lessonId}`);
        if (!res.ok) throw new Error("Failed to load lesson");
        const data = await res.json();
        setLesson(data.lesson);
      } catch {
        toast.error("Could not load lesson");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.lessonId]);

  if (loading) {
    return (
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="h-8 bg-muted rounded animate-pulse" />
          <div className="h-64 bg-muted rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (!lesson) return null;

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl">
        <Button
          variant="ghost"
          size="sm"
          className="mb-6"
          onClick={() => router.push("/queue")}
        >
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back to queue
        </Button>
        <LessonViewer
          lesson={lesson}
          onComplete={() => {
            toast.success("Lesson completed!");
            router.push("/queue");
          }}
          continueLabel="Back to queue"
        />
      </div>
    </div>
  );
}
