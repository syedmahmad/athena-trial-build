"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { QuestContext } from "./quest-context";
import { useAnswerQuestProblem, useCompleteQuest } from "@/hooks/use-daily-quest";
import type { DailyQuest, DailyQuestProblemWithDetails } from "@/types/adaptive";
import type { FeedbackState } from "@/components/quiz/answer-panel";
import type { QuestionPhase } from "@/components/quiz/types";

type Props = {
  quest: DailyQuest;
  problems: DailyQuestProblemWithDetails[];
  children: React.ReactNode;
};

export function QuestProvider({ quest, problems, children }: Props) {
  const [currentIndex, setCurrentIndex] = useState(() => {
    // Resume from first unanswered problem
    const firstUnanswered = problems.findIndex((p) => p.isCorrect === null);
    return firstUnanswered >= 0 ? firstUnanswered : 0;
  });
  const [answers, setAnswers] = useState<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const p of problems) {
      if (p.selectedOption !== null) map.set(p.id, p.selectedOption);
    }
    return map;
  });
  const [lockedIds, setLockedIds] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const p of problems) {
      if (p.isCorrect === true) set.add(p.id);
    }
    return set;
  });
  const [feedbackMap, setFeedbackMap] = useState<Map<string, FeedbackState>>(new Map());
  const [phase, setPhase] = useState<"active" | "completed">(
    quest.status === "completed" ? "completed" : "active"
  );
  const [xpEarned, setXpEarned] = useState(quest.xpEarned);

  // Wrong-answer tracking & question phases
  const [wrongCounts, setWrongCounts] = useState<Map<string, number>>(new Map());
  const [questionPhases, setQuestionPhases] = useState<Map<string, QuestionPhase>>(new Map());
  const [stuckModalShownIds, setStuckModalShownIds] = useState<Set<string>>(new Set());

  // Timer
  const [elapsed, setElapsed] = useState(quest.timeElapsedSeconds);
  const [timerHidden, setTimerHidden] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase !== "active") return;
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timerRef.current!);
  }, [phase]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Direction tracking
  const prevIndexRef = useRef(currentIndex);
  const direction = currentIndex >= prevIndexRef.current ? 1 : -1;
  useEffect(() => {
    prevIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Mutations
  const answerMutation = useAnswerQuestProblem();
  const completeMutation = useCompleteQuest();

  const actualScore = problems.filter((p) => p.isCorrect === true).length;

  // Question phase helpers
  const getQuestionPhase = useCallback(
    (id: string): QuestionPhase => questionPhases.get(id) ?? "question",
    [questionPhases]
  );

  const getWrongCount = useCallback(
    (id: string) => wrongCounts.get(id) ?? 0,
    [wrongCounts]
  );

  const markStuckModalShown = useCallback((id: string) => {
    setStuckModalShownIds((prev) => new Set(prev).add(id));
  }, []);

  const handleSelectAnswer = useCallback(
    (problemId: string, optionIndex: number) => {
      if (lockedIds.has(problemId) || phase !== "active") return;

      const problem = problems.find((p) => p.id === problemId);
      if (!problem) return;

      const isCorrect = optionIndex === problem.correctOption;
      setAnswers((prev) => new Map(prev).set(problemId, optionIndex));

      if (isCorrect) {
        setLockedIds((prev) => new Set(prev).add(problemId));
        setFeedbackMap((prev) =>
          new Map(prev).set(problemId, { type: "correct", correctOption: problem.correctOption })
        );

        // Record answer via API
        const startTime = performance.now();
        answerMutation.mutate({
          questProblemId: problem.id,
          questId: quest.id,
          selectedOption: optionIndex,
          isCorrect: true,
          responseTimeMs: Math.round(startTime),
          subtopicId: problem.subtopicId,
          difficultyLevel: problem.difficultyLevel,
        }, {
          onSuccess: (data) => {
            if (data.xpEarned > 0) {
              setXpEarned((prev) => prev + data.xpEarned);
            }
          },
        });

        // Auto-advance only if NOT in tutor phase (tutor page handles its own navigation)
        const currentPhase = questionPhases.get(problemId) ?? "question";
        if (currentPhase !== "tutor") {
          setTimeout(() => {
            setFeedbackMap((prev) => {
              const n = new Map(prev);
              n.delete(problemId);
              return n;
            });
            setCurrentIndex((i) => Math.min(i + 1, problems.length - 1));
          }, 1200);
        }
      } else {
        setFeedbackMap((prev) =>
          new Map(prev).set(problemId, { type: "wrong", correctOption: problem.correctOption })
        );

        // Track wrong count and escalate phase: 1→hint, 2→hint2, 3+→tutor
        const newCount = (wrongCounts.get(problemId) ?? 0) + 1;
        setWrongCounts((prev) => new Map(prev).set(problemId, newCount));
        if (newCount === 1) {
          setQuestionPhases((prev) => new Map(prev).set(problemId, "hint"));
        } else if (newCount === 2) {
          setQuestionPhases((prev) => new Map(prev).set(problemId, "hint2"));
        } else {
          setQuestionPhases((prev) => new Map(prev).set(problemId, "tutor"));
        }

        // Record wrong answer
        answerMutation.mutate({
          questProblemId: problem.id,
          questId: quest.id,
          selectedOption: optionIndex,
          isCorrect: false,
          responseTimeMs: 0,
          subtopicId: problem.subtopicId,
          difficultyLevel: problem.difficultyLevel,
        });

        setTimeout(() => {
          setFeedbackMap((prev) => {
            const n = new Map(prev);
            n.delete(problemId);
            return n;
          });
        }, 2000);
      }
    },
    [lockedIds, phase, problems, quest.id, answerMutation, wrongCounts, questionPhases]
  );

  const handleComplete = useCallback(() => {
    if (phase !== "active") return;
    setPhase("completed");
    clearInterval(timerRef.current!);
    completeMutation.mutate({
      questId: quest.id,
      timeElapsedSeconds: elapsed,
    });
  }, [phase, quest.id, elapsed, completeMutation]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, problems.length - 1));
  }, [problems.length]);

  const goBack = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const goTo = useCallback((index: number) => {
    if (index >= 0 && index < problems.length) setCurrentIndex(index);
  }, [problems.length]);

  const getQuestionStatus = useCallback(
    (index: number): "unanswered" | "answered" | "marked" => {
      const p = problems[index];
      if (!p) return "unanswered";
      if (lockedIds.has(p.id) || p.isCorrect === true) return "answered";
      if (answers.has(p.id)) return "answered";
      return "unanswered";
    },
    [problems, lockedIds, answers]
  );

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <QuestContext.Provider
      value={{
        quest,
        problems,
        currentIndex,
        answers,
        lockedIds,
        feedbackMap,
        direction,
        phase,
        score: actualScore,
        elapsed,
        displayTime: formatTime(elapsed),
        timerHidden,
        isTimerLow: false,
        xpEarned,
        handleSelectAnswer,
        goNext,
        goBack,
        goTo,
        toggleTimerHidden: () => setTimerHidden((h) => !h),
        handleComplete,
        getQuestionStatus,
        getQuestionPhase,
        getWrongCount,
        stuckModalShownIds,
        markStuckModalShown,
      }}
    >
      {children}
    </QuestContext.Provider>
  );
}
