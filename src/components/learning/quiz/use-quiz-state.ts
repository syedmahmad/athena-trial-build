"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { Problem, QuizPhase, QuestionPhase, QuestionStatus } from "@/components/quiz/types";

export function useQuizState(problems: Problem[], isGenerating = false) {
  const [answers, setAnswers] = useState<Map<string, number>>(new Map());
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<QuizPhase>("active");
  const [wrongCounts, setWrongCounts] = useState<Map<string, number>>(new Map());
  const [questionPhases, setQuestionPhases] = useState<Map<string, QuestionPhase>>(new Map());

  // Per-question timing: records Date.now() when each question is first displayed
  const questionStartTimesRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const problem = problems[currentIndex];
    if (problem && !questionStartTimesRef.current.has(problem.id)) {
      questionStartTimesRef.current.set(problem.id, Date.now());
    }
  }, [currentIndex, problems]);

  const getQuestionElapsedMs = useCallback((problemId: string): number => {
    const start = questionStartTimesRef.current.get(problemId);
    if (!start) return 0;
    return Date.now() - start;
  }, []);

  const selectAnswer = useCallback(
    (problemId: string, optionIndex: number) => {
      if (phase === "submitted") return;
      setAnswers((prev) => {
        const next = new Map(prev);
        next.set(problemId, optionIndex);
        return next;
      });
    },
    [phase]
  );

  const toggleMark = useCallback(
    (problemId: string) => {
      if (phase === "submitted") return;
      setMarkedIds((prev) => {
        const next = new Set(prev);
        if (next.has(problemId)) next.delete(problemId);
        else next.add(problemId);
        return next;
      });
    },
    [phase]
  );

  const goTo = useCallback(
    (index: number) => {
      if (index >= 0 && index < problems.length) setCurrentIndex(index);
    },
    [problems.length]
  );

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, problems.length - 1));
  }, [problems.length]);

  const goBack = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const submit = useCallback(() => {
    setPhase("submitted");
  }, []);

  const onWrongAnswer = useCallback((id: string) => {
    const newCount = (wrongCounts.get(id) ?? 0) + 1;
    setWrongCounts(prev => new Map(prev).set(id, newCount));
    setQuestionPhases(prev => new Map(prev).set(id, newCount === 1 ? "hint" : "tutor"));
  }, [wrongCounts]);

  const enterPractice = useCallback((id: string) => {
    setQuestionPhases(prev => new Map(prev).set(id, "practice"));
  }, []);

  const completePractice = useCallback(() => {
    // While problems are still streaming in, the current tail is NOT the
    // real end — submitting here would cut a streaming quiz short. Only
    // submit once generation is complete and we're on the last problem.
    if (!isGenerating && currentIndex >= problems.length - 1) {
      // Last problem — completing practice means the whole quiz is done.
      // Without this branch the index just caps at length-1 (no-op) and the
      // quiz hangs; ResultsScreen only mounts when phase === "submitted".
      setPhase("submitted");
      return;
    }
    setCurrentIndex(i => Math.min(i + 1, problems.length - 1));
  }, [currentIndex, problems.length, isGenerating]);

  const getWrongCount = useCallback((id: string) => wrongCounts.get(id) ?? 0, [wrongCounts]);
  const getQuestionPhase = useCallback((id: string): QuestionPhase => questionPhases.get(id) ?? "question", [questionPhases]);

  const restart = useCallback(() => {
    setAnswers(new Map());
    setMarkedIds(new Set());
    setCurrentIndex(0);
    setPhase("active");
    setWrongCounts(new Map());
    setQuestionPhases(new Map());
    questionStartTimesRef.current = new Map();
  }, []);

  const getQuestionStatus = useCallback(
    (index: number): QuestionStatus => {
      const p = problems[index];
      if (!p) return "unanswered";
      if (markedIds.has(p.id)) return "marked";
      if (answers.has(p.id)) return "answered";
      return "unanswered";
    },
    [problems, answers, markedIds]
  );

  const score = useMemo(() => {
    if (phase !== "submitted") return 0;
    let correct = 0;
    for (const p of problems) {
      if (answers.get(p.id) === p.correctOption) correct++;
    }
    return correct;
  }, [phase, problems, answers]);

  const unansweredCount = useMemo(() => {
    return problems.filter((p) => !answers.has(p.id)).length;
  }, [problems, answers]);

  return {
    answers,
    markedIds,
    currentIndex,
    phase,
    score,
    unansweredCount,
    wrongCounts,
    selectAnswer,
    toggleMark,
    goTo,
    goNext,
    goBack,
    submit,
    restart,
    getQuestionStatus,
    onWrongAnswer,
    enterPractice,
    completePractice,
    getWrongCount,
    getQuestionPhase,
    getQuestionElapsedMs,
  };
}
