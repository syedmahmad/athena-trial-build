"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PERSONALIZED_SESSION_KEY } from "@/app/(protected)/personalized/page";

export type StartSpecializedPracticeArgs = {
  topicName: string;
  subtopicName: string;
  /** Question text of problems the user got wrong. Up to 5 are forwarded to
   * the classifier so it can weight related subtopics into the mix. */
  wrongQuestionTexts?: string[];
  count?: 3 | 5 | 8;
};

type ApiResponse = {
  classification: { notes: string | null };
  problems: unknown[];
};

/** Hand off to the existing /personalized flow without making the user paste
 * anything. Builds a synthetic plan from the topic + subtopic the user is
 * already in, plus the text of any problems they missed, then routes through
 * the same classifier → sessionStorage → /personalized/quiz/1 pipeline that
 * the paste UI uses. */
export function useSpecializedPractice() {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);

  async function startPractice({
    topicName,
    subtopicName,
    wrongQuestionTexts = [],
    count = 8,
  }: StartSpecializedPracticeArgs) {
    if (isStarting) return;
    setIsStarting(true);
    try {
      const wrongBlock =
        wrongQuestionTexts.length > 0
          ? `\n\nThe student struggled on these problems and needs more practice on the underlying concepts:\n${wrongQuestionTexts
              .slice(0, 5)
              .map((q, i) => `${i + 1}. ${q.slice(0, 240)}`)
              .join("\n")}`
          : "";
      const plan = `Targeted practice for ${topicName}: ${subtopicName}. The student wants a specialized problem set on this subtopic and any closely related areas where they need more work.${wrongBlock}`;

      const res = await fetch("/api/lesson-plan/practice-problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, count }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body?.error || `Failed (${res.status})`);
      }
      const data = (await res.json()) as ApiResponse;
      if (!data?.problems?.length) {
        throw new Error(
          data?.classification?.notes ??
            "Couldn't find practice problems for this topic."
        );
      }
      sessionStorage.setItem(PERSONALIZED_SESSION_KEY, JSON.stringify(data));
      router.push("/personalized/quiz/1");
      // Leave isStarting=true through navigation so the caller's button stays
      // disabled until the route transition takes the screen.
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to start practice";
      toast.error(message);
      setIsStarting(false);
    }
  }

  return { startPractice, isStarting };
}
