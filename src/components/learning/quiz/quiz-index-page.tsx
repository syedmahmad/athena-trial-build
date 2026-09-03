"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuizRouteContext } from "@/components/learning/quiz/quiz-route-context";

export function QuizIndexPageContent() {
  const router = useRouter();
  const { basePath, quiz } = useQuizRouteContext();

  useEffect(() => {
    router.replace(`${basePath}/quiz/${quiz.currentIndex + 1}`);
  }, [router, basePath, quiz.currentIndex]);

  return null;
}
