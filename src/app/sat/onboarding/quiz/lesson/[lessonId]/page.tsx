"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LessonViewer } from "@/components/lessons/lesson-viewer";
import { ProgressStepper } from "@/components/sat/onboarding/progress-stepper";
import { toast } from "sonner";
import type { LessonContent } from "@/lib/lesson-types";

type Lesson = {
  id: string;
  title: string;
  content: LessonContent;
  estimatedDurationMinutes: number;
};

export default function InlineQuizLessonPage() {
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
      <div className="flex flex-col items-center gap-8">
        <ProgressStepper currentStep="quiz" />
        <div className="w-full max-w-2xl space-y-4">
          <div className="h-8 bg-muted rounded animate-pulse" />
          <div className="h-64 bg-muted rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (!lesson) return null;

  return (
    <div className="flex flex-col items-center gap-8">
      <ProgressStepper currentStep="quiz" />
      <div className="w-full max-w-2xl">
        <LessonViewer
          lesson={lesson}
          onComplete={() => router.push("/sat/onboarding/quiz")}
          continueLabel="Back to quiz"
        />
      </div>
    </div>
  );
}
