"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LessonSection } from "./lesson-section";
import { LessonProgressIndicator } from "./lesson-progress-indicator";
import { LessonCompleteCard } from "./lesson-complete-card";
import { AskTutor } from "./ask-tutor";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, MessageCircleQuestion, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { LessonContent } from "@/lib/lesson-types";

type Lesson = {
  id: string;
  title: string;
  content: LessonContent;
  estimatedDurationMinutes: number;
};

export function LessonViewer({
  lesson,
  onComplete,
  continueLabel = "Continue",
}: {
  lesson: Lesson;
  onComplete: () => void;
  continueLabel?: string;
}) {
  const sections = lesson.content.sections;
  const [viewedSections, setViewedSections] = useState(1);
  const [chatOpen, setChatOpen] = useState(false);
  const allViewed = viewedSections >= sections.length;

  const lessonContentStr = sections
    .map((s) =>
      s.type === "walkthrough"
        ? `${s.title}: ${s.steps.join(", ")}`
        : `${s.title}: ${s.content}`
    )
    .join("\n");

  // Report progress
  useEffect(() => {
    const progressPct = Math.round((viewedSections / sections.length) * 100);
    const status = allViewed ? "completed" : "in_progress";

    fetch(`/api/lessons/${lesson.id}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ progressPct, status }),
    }).catch(() => {});
  }, [viewedSections, sections.length, allViewed, lesson.id]);

  return (
    <div className="flex gap-6 justify-center items-start">
      <div className="w-full max-w-2xl space-y-6 shrink-0">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl">{lesson.title}</CardTitle>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {lesson.estimatedDurationMinutes} min
              </div>
            </div>
            <LessonProgressIndicator
              current={viewedSections}
              total={sections.length}
            />
          </CardHeader>
          <CardContent className="space-y-6">
            {sections.slice(0, viewedSections).map((section, i) => (
              <LessonSection key={i} section={section} index={i} />
            ))}

            {!allViewed && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setViewedSections((v) => v + 1)}
                >
                  Continue reading
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {allViewed && !chatOpen && (
          <Button
            variant="outline"
            className="w-full justify-start gap-2 dark:hover:bg-accent/10 dark:hover:text-foreground"
            onClick={() => setChatOpen(true)}
          >
            <MessageCircleQuestion className="h-4 w-4 text-athena-amber" />
            Ask Athena (voice or text)
          </Button>
        )}

        {allViewed && (
          <LessonCompleteCard
            onContinue={onComplete}
            continueLabel={continueLabel}
          />
        )}
      </div>

      <AnimatePresence>
        {chatOpen && (
          <motion.div
            className="shrink-0 sticky top-6 overflow-hidden"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 400, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="w-[400px]">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MessageCircleQuestion className="h-4 w-4 text-athena-amber" />
                  Ask Athena
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setChatOpen(false)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <AskTutor
                lessonTitle={lesson.title}
                lessonContent={lessonContentStr}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
