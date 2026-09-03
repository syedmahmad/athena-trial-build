"use client";

import { useState, useCallback, useRef } from "react";
import type { WhiteboardStep } from "@/types/whiteboard";

export interface QuizQuestion {
  id: string;
  topic: string;
  difficulty: string;
  question_text: string;
  options: string[];
  correct_option: number;
  explanation: string;
  solution_steps: Array<{ step: string; math?: string; description: string }>;
  hint: string;
  detailed_hint: string;
  verified: boolean;
}

export interface CheckResult {
  correct: boolean;
  correct_option: number;
  explanation: string;
  solution_steps: Array<{ step: string; math?: string; description: string }>;
  hint: string;
  detailed_hint: string;
  attempts: number;
  verified: boolean;
}

export interface QuizScore {
  correct: number;
  total: number;
  questions: Array<{
    id: string;
    correct: boolean;
    attempts: number;
  }>;
}

type QuizState = "idle" | "generating" | "ready" | "checking" | "complete" | "error";

export function useStudioQuiz() {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [state, setState] = useState<QuizState>("idle");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<QuizScore>({
    correct: 0,
    total: 0,
    questions: [],
  });

  // Whiteboard explanation state
  const [explainSteps, setExplainSteps] = useState<WhiteboardStep[]>([]);
  const [isExplaining, setIsExplaining] = useState(false);
  const nextExplainStepId = useRef(0);

  const generateQuestions = useCallback(
    async (
      topic: string,
      difficulty: string = "medium",
      count: number = 3,
      sessionId?: string | null,
      agentId?: string | null
    ) => {
      setIsGenerating(true);
      setState("generating");
      setError(null);

      try {
        const res = await fetch("/api/studio/quiz/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic,
            count,
            difficulty,
            session_id: sessionId ?? null,
            agent_id: agentId ?? null,
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to generate questions");
        }

        const data = await res.json();
        const newQuestions: QuizQuestion[] = data.questions || [];

        setQuestions(newQuestions);
        setCurrentIndex(0);
        setScore({ correct: 0, total: 0, questions: [] });
        setState(newQuestions.length > 0 ? "ready" : "error");

        return newQuestions;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to generate questions";
        setError(msg);
        setState("error");
        return [];
      } finally {
        setIsGenerating(false);
      }
    },
    []
  );

  const checkAnswer = useCallback(
    async (
      questionId: string,
      selectedOption: number
    ): Promise<CheckResult | null> => {
      setIsChecking(true);

      try {
        const res = await fetch("/api/studio/quiz/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question_id: questionId,
            selected_option: selectedOption,
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to check answer");
        }

        const result: CheckResult = await res.json();

        // Update score
        setScore((prev) => ({
          correct: prev.correct + (result.correct ? 1 : 0),
          total: prev.total + (result.attempts === 1 ? 1 : 0), // only count first attempt
          questions:
            result.attempts === 1
              ? [
                  ...prev.questions,
                  {
                    id: questionId,
                    correct: result.correct,
                    attempts: result.attempts,
                  },
                ]
              : prev.questions.map((q) =>
                  q.id === questionId
                    ? { ...q, correct: result.correct, attempts: result.attempts }
                    : q
                ),
        }));

        return result;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to check answer"
        );
        return null;
      } finally {
        setIsChecking(false);
      }
    },
    []
  );

  const getNextDifficulty = useCallback(
    async (sessionId: string): Promise<string> => {
      try {
        const res = await fetch("/api/studio/quiz/next-difficulty", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });

        if (!res.ok) return "medium";

        const data = await res.json();
        return data.difficulty || "medium";
      } catch {
        return "medium";
      }
    },
    []
  );

  const requestWhiteboardExplanation = useCallback(
    async (questionId: string, studentOption?: number) => {
      setIsExplaining(true);
      setExplainSteps([]);
      nextExplainStepId.current = 0;

      try {
        const res = await fetch(
          "/api/studio/quiz/whiteboard-explain/stream",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question_id: questionId,
              student_option: studentOption ?? null,
            }),
          }
        );

        if (!res.ok || !res.body) {
          throw new Error("Failed to start whiteboard explanation");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.wb_step) {
                const step: WhiteboardStep = {
                  ...parsed.wb_step,
                  id: nextExplainStepId.current++,
                };
                setExplainSteps((prev) => [...prev, step]);
              }
            } catch {
              // skip parse errors
            }
          }
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Whiteboard explanation failed"
        );
      } finally {
        setIsExplaining(false);
      }
    },
    []
  );

  const advanceQuestion = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setState("complete");
    }
  }, [currentIndex, questions.length]);

  const reset = useCallback(() => {
    setQuestions([]);
    setCurrentIndex(0);
    setState("idle");
    setError(null);
    setScore({ correct: 0, total: 0, questions: [] });
    setExplainSteps([]);
  }, []);

  return {
    // State
    questions,
    currentIndex,
    currentQuestion: questions[currentIndex] || null,
    state,
    isGenerating,
    isChecking,
    error,
    score,

    // Whiteboard explanation
    explainSteps,
    isExplaining,

    // Actions
    generateQuestions,
    checkAnswer,
    getNextDifficulty,
    requestWhiteboardExplanation,
    advanceQuestion,
    reset,
  };
}
