"use client";

import { TutorChat } from "./tutor-chat";

export function AskTutor({
  lessonTitle,
  lessonContent,
}: {
  lessonTitle: string;
  lessonContent: string;
}) {
  return <TutorChat lessonTitle={lessonTitle} lessonContent={lessonContent} />;
}
