"use client";

import { useParams, useRouter } from "next/navigation";
import { useMyLearningTopic } from "@/hooks/use-my-learning-topic";
import { MicroLesson } from "@/components/learning/micro-lesson";

export default function MyLearningMicroLessonPage() {
  const params = useParams<{ topicId: string }>();
  const router = useRouter();
  const { data, isLoading } = useMyLearningTopic(params.topicId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    );
  }

  if (!data) return null;

  const { topic } = data;

  return (
    <MicroLesson
      topic={topic.title}
      subtopic={topic.title}
      metadata={{
        description: topic.description,
        learningObjectives: topic.learningObjectives,
        tipsAndTricks: topic.tipsAndTricks,
        commonMistakes: topic.commonMistakes,
      }}
      streamUrl="/api/my-learning/lesson/stream"
      chatStreamUrl="/api/my-learning/lesson/chat/stream"
      practiceMode={{ subject: "math", quizStreamUrl: "/api/my-learning/quiz-chat/stream" }}
      ambientMusicUrl="/audio/lesson-ambient.mp3"
      onClose={() => router.push("/dashboard")}
    />
  );
}
