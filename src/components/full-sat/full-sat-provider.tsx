"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { FullSatContext, type FullSatPhase } from "./full-sat-context";
import { useAnswerFullSat, useSubmitFullSat } from "@/hooks/use-full-sat";
import {
  questionToSectionModule,
  MODULE_TIME_LIMITS,
  type FullSatTestProblem,
  type FullSatAnswer,
  type FullSatAttempt,
  type FullSatTest,
  type FullSatSection,
} from "@/types/full-sat";

type Props = {
  attempt: FullSatAttempt;
  test: FullSatTest;
  problems: FullSatTestProblem[];
  initialAnswers: FullSatAnswer[];
  children: React.ReactNode;
};

function getModuleTimeLimit(section: FullSatSection, module: number): number {
  return MODULE_TIME_LIMITS[section][module as 1 | 2];
}

function getSectionLabel(section: FullSatSection): string {
  return section === "reading_writing" ? "Reading & Writing" : "Math";
}

export function FullSatProvider({
  attempt,
  test,
  problems,
  initialAnswers,
  children,
}: Props) {
  const router = useRouter();
  const answerMutation = useAnswerFullSat();
  const submitMutation = useSubmitFullSat();

  // Build initial state from any existing answers
  const [answers, setAnswers] = useState<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const a of initialAnswers) {
      if (a.selectedOption != null) {
        map.set(a.problemId, a.selectedOption);
      }
    }
    return map;
  });

  const [lockedIds, setLockedIds] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const a of initialAnswers) {
      if (a.selectedOption != null) set.add(a.problemId);
    }
    return set;
  });

  // Determine starting position
  const resumeIndex = useMemo(() => {
    // Find first unanswered problem, or start from the beginning
    for (let i = 0; i < problems.length; i++) {
      if (!lockedIds.has(problems[i].problemId)) return i;
    }
    return 0;
  }, [problems, lockedIds]);

  const [currentIndex, setCurrentIndex] = useState(resumeIndex);
  const [direction, setDirection] = useState(1);

  // Phase management
  const [phase, setPhase] = useState<FullSatPhase>(() => {
    if (attempt.status === "completed") return "completed";
    return "active";
  });

  // Current problem derived from index
  const currentProblem = problems[currentIndex] ?? null;
  const currentPos = questionToSectionModule(currentIndex + 1);

  // Timer — countdown per module
  // Calculate used time per module from answered problems
  const [rwTimeUsed, setRwTimeUsed] = useState(attempt.rwTimeSeconds ?? 0);
  const [mathTimeUsed, setMathTimeUsed] = useState(attempt.mathTimeSeconds ?? 0);

  const moduleTimeLimit = getModuleTimeLimit(currentPos.section, currentPos.module);

  // Track time spent in current section continuously
  const sectionStartRef = useRef(Date.now());
  const [timeLeft, setTimeLeft] = useState(() => {
    const used = currentPos.section === "reading_writing" ? rwTimeUsed : mathTimeUsed;
    // Each section has 2 modules; used is for the whole section
    const sectionLimit =
      getModuleTimeLimit(currentPos.section, 1) +
      getModuleTimeLimit(currentPos.section, 2);
    return Math.max(0, sectionLimit - used);
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase !== "active") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    sectionStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Time's up — auto-advance to next section or submit
          clearInterval(timerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase, currentPos.section]);

  // Auto-advance when timer hits 0
  useEffect(() => {
    if (timeLeft === 0 && phase === "active") {
      if (currentPos.section === "reading_writing") {
        finishSection();
      } else {
        submitTest();
      }
    }
  }, [timeLeft, phase, currentPos.section]);

  const displayTime = useMemo(() => {
    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [timeLeft]);

  // Navigation
  const goNext = useCallback(() => {
    setDirection(1);
    setCurrentIndex((i) => Math.min(i + 1, problems.length - 1));
  }, [problems.length]);

  const goBack = useCallback(() => {
    setDirection(-1);
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const goTo = useCallback(
    (index: number) => {
      setDirection(index > currentIndex ? 1 : -1);
      setCurrentIndex(Math.max(0, Math.min(index, problems.length - 1)));
    },
    [currentIndex, problems.length]
  );

  // Answer handling — no hint/tutor escalation, just record
  const handleSelectAnswer = useCallback(
    (problemId: string, optionIndex: number) => {
      if (phase !== "active") return;

      // Find the problem to check correctness
      const problem = problems.find((p) => p.problemId === problemId);
      if (!problem) return;

      // Allow re-answering (override previous choice)
      setAnswers((prev) => new Map(prev).set(problemId, optionIndex));
      setLockedIds((prev) => new Set(prev).add(problemId));

      // Fire API call (don't block UI)
      answerMutation.mutate({
        attemptId: attempt.id,
        problemId,
        section: problem.section,
        module: problem.module,
        orderIndex: problem.orderIndex,
        selectedOption: optionIndex,
        isCorrect: optionIndex === (problem as any).correctOption,
        responseTimeMs: undefined,
      });
    },
    [phase, problems, attempt.id, answerMutation]
  );

  // Section transition
  const finishSection = useCallback(() => {
    // Record R&W time
    const elapsed = Math.round((Date.now() - sectionStartRef.current) / 1000);
    setRwTimeUsed((prev) => prev + elapsed);

    // Move to break phase
    setPhase("break");
    router.push(`/full-sat/${attempt.id}/break`);
  }, [attempt.id, router]);

  // Called from break page to start math section
  const startMathSection = useCallback(() => {
    setPhase("active");
    // Find first math problem
    const mathStart = problems.findIndex((p) => p.section === "math");
    if (mathStart >= 0) {
      setCurrentIndex(mathStart);
      // Reset timer for math section
      const mathLimit = getModuleTimeLimit("math", 1) + getModuleTimeLimit("math", 2);
      setTimeLeft(mathLimit);
      sectionStartRef.current = Date.now();
    }
  }, [problems]);

  // Submit test
  const submitTest = useCallback(() => {
    // Record math time
    const elapsed = Math.round((Date.now() - sectionStartRef.current) / 1000);
    const finalMathTime = mathTimeUsed + elapsed;

    setPhase("completed");

    submitMutation.mutate(
      {
        attemptId: attempt.id,
        rwTimeSeconds: rwTimeUsed,
        mathTimeSeconds: finalMathTime,
      },
      {
        onSuccess: () => {
          router.push(`/full-sat/${attempt.id}/results`);
        },
      }
    );
  }, [attempt.id, rwTimeUsed, mathTimeUsed, submitMutation, router]);

  // Status helpers
  const getQuestionStatus = useCallback(
    (index: number): "unanswered" | "answered" => {
      const problem = problems[index];
      if (!problem) return "unanswered";
      return lockedIds.has(problem.problemId) ? "answered" : "unanswered";
    },
    [problems, lockedIds]
  );

  const answeredCount = lockedIds.size;
  const sectionLabel = getSectionLabel(currentPos.section);
  const moduleLabel = `Module ${currentPos.module}`;

  return (
    <FullSatContext.Provider
      value={{
        attempt,
        test,
        problems,
        currentIndex,
        currentSection: currentPos.section,
        currentModule: currentPos.module,
        currentProblem,
        answers,
        lockedIds,
        phase,
        timeLeft,
        displayTime,
        goNext,
        goBack,
        goTo,
        direction,
        handleSelectAnswer,
        finishSection,
        submitTest,
        getQuestionStatus,
        totalQuestions: problems.length,
        answeredCount,
        sectionLabel,
        moduleLabel,
        rwTimeUsed,
        mathTimeUsed,
      }}
    >
      {children}
    </FullSatContext.Provider>
  );
}
