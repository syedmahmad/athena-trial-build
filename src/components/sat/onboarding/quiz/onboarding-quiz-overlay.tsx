"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AnimatePresence } from "framer-motion";
import { Toolbar } from "@/components/quiz/toolbar";
import { SegmentProgressBar } from "@/components/quiz/segment-progress-bar";
import { QuestionPanel } from "@/components/quiz/question-panel";
import { AnswerPanel } from "@/components/quiz/answer-panel";
import type { FeedbackState } from "@/components/quiz/answer-panel";
import { BottomBar } from "@/components/quiz/bottom-bar";
import { Calculator } from "@/components/quiz/calculator";
import type { Problem, QuestionStatus } from "@/components/quiz/types";
import { ExplanationPanel } from "./explanation-panel";
import { LessonPreferenceModal } from "./lesson-preference-modal";
import { QuizCompletion } from "./quiz-completion";

type Question = {
  id: string;
  orderIndex: number;
  difficulty: string;
  category: string;
  questionText: string;
  options: string[];
};

type AnswerState =
  | { type: "unanswered" }
  | { type: "correct"; correctOption: number }
  | {
      type: "wrong";
      selectedOption: number;
      correctOption: number;
      explanation: string;
    };

type CompletionData = {
  skillScore: number;
  totalQuestions: number;
  correctCount: number;
};

/** Convert an onboarding Question into the shared Problem shape */
function questionToProblem(q: Question): Problem {
  return {
    id: q.id,
    orderIndex: q.orderIndex,
    difficulty: q.difficulty,
    questionText: q.questionText,
    options: q.options,
    correctOption: -1,
    hint: "",
    explanation: "",
    solutionSteps: [],
    timeRecommendationSeconds: 0,
  };
}

export function OnboardingQuizOverlay() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const prevIndexRef = useRef(0);

  // Quiz data
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState>({
    type: "unanswered",
  });
  const [answeredSet, setAnsweredSet] = useState<Set<string>>(new Set());

  // Lesson preference
  const [lessonPreference, setLessonPreference] = useState<
    "view_now" | "queue_for_later" | null
  >(null);
  const [showPreferenceModal, setShowPreferenceModal] = useState(false);
  const [pendingWrongAnswer, setPendingWrongAnswer] = useState<{
    lessonId: string | null;
  } | null>(null);
  const [hasHadFirstWrong, setHasHadFirstWrong] = useState(false);

  // Misc state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completion, setCompletion] = useState<CompletionData | null>(null);
  const [startTime, setStartTime] = useState<number>(Date.now());

  // Track navigation direction for animations
  const direction = currentIndex >= prevIndexRef.current ? 1 : -1;
  useEffect(() => {
    prevIndexRef.current = currentIndex;
  }, [currentIndex]);

  // SSR guard
  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Load questions
  useEffect(() => {
    async function loadQuestions() {
      try {
        const res = await fetch("/api/quiz/questions");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setQuestions(data.questions);
        setCurrentIndex(data.currentIndex ?? 0);
        if (data.lessonPreference) {
          setLessonPreference(data.lessonPreference);
          setHasHadFirstWrong(true);
        }
      } catch {
        toast.error("Failed to load quiz questions");
      } finally {
        setLoading(false);
      }
    }
    loadQuestions();
  }, []);

  // Auto-complete if all questions already answered
  useEffect(() => {
    if (
      !loading &&
      questions.length > 0 &&
      currentIndex >= questions.length &&
      !completion
    ) {
      handleComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, questions.length, currentIndex, completion]);

  // Reset timer on new question
  useEffect(() => {
    setStartTime(Date.now());
  }, [currentIndex]);

  const handleAnswer = useCallback(
    async (optionIndex: number) => {
      if (submitting || answerState.type !== "unanswered") return;

      const question = questions[currentIndex];
      if (!question) return;

      setSubmitting(true);

      try {
        const timeSpent = Math.round((Date.now() - startTime) / 1000);
        const res = await fetch("/api/quiz/attempt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId: question.id,
            selectedOption: optionIndex,
            timeSpentSeconds: timeSpent,
            nextIndex: currentIndex + 1,
          }),
        });

        if (!res.ok) throw new Error("Failed to submit");
        const result = await res.json();

        // Mark this question as answered
        setAnsweredSet((prev) => {
          const next = new Set(prev);
          next.add(question.id);
          return next;
        });

        if (result.isCorrect) {
          setAnswerState({
            type: "correct",
            correctOption: result.correctOption,
          });
          toast.success("Correct!");
        } else {
          setAnswerState({
            type: "wrong",
            selectedOption: optionIndex,
            correctOption: result.correctOption,
            explanation: result.explanation,
          });

          if (!hasHadFirstWrong && !lessonPreference) {
            setPendingWrongAnswer({ lessonId: result.lessonId });
            setShowPreferenceModal(true);
            setHasHadFirstWrong(true);
          } else if (lessonPreference === "view_now" && result.lessonId) {
            const lessonId = result.lessonId;
            setTimeout(() => {
              router.push(`/sat/onboarding/quiz/lesson/${lessonId}`);
            }, 1500);
          } else {
            toast("Lesson queued for review", {
              description: "You can find it in your learning queue.",
            });
          }
        }
      } catch {
        toast.error("Something went wrong. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [
      submitting,
      answerState,
      questions,
      currentIndex,
      startTime,
      hasHadFirstWrong,
      lessonPreference,
      router,
    ]
  );

  const handlePreferenceSelect = useCallback(
    async (preference: "view_now" | "queue_for_later") => {
      setLessonPreference(preference);
      setShowPreferenceModal(false);

      await fetch("/api/quiz/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: questions[currentIndex]?.id,
          selectedOption: -1,
          lessonPreference: preference,
          nextIndex: currentIndex + 1,
        }),
      }).catch(() => {});

      if (preference === "view_now" && pendingWrongAnswer?.lessonId) {
        router.push(
          `/sat/onboarding/quiz/lesson/${pendingWrongAnswer.lessonId}`
        );
      } else {
        toast("Lesson queued for review", {
          description: "You can find it in your learning queue.",
        });
      }

      setPendingWrongAnswer(null);
    },
    [questions, currentIndex, pendingWrongAnswer, router]
  );

  const handleNext = useCallback(() => {
    if (currentIndex + 1 >= questions.length) {
      handleComplete();
    } else {
      setCurrentIndex((i) => i + 1);
      setAnswerState({ type: "unanswered" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, questions.length]);

  const handleComplete = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/quiz/complete", { method: "POST" });
      if (!res.ok) throw new Error("Failed to complete");
      const data = await res.json();
      setCompletion(data);
    } catch {
      toast.error("Failed to save results. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const getQuestionStatus = useCallback(
    (index: number): QuestionStatus => {
      const q = questions[index];
      if (!q) return "unanswered";
      if (answeredSet.has(q.id)) return "answered";
      return "unanswered";
    },
    [questions, answeredSet]
  );

  const skipMutation = useMutation({
    mutationFn: () =>
      fetch("/api/quiz/complete", { method: "POST" }).then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      }),
    onSuccess: () => router.push("/sat/onboarding/schedule"),
    onError: () => toast.error("Failed to skip quiz. Please try again."),
  });

  const handleSkip = useCallback(() => skipMutation.mutate(), [skipMutation]);

  const handleClose = useCallback(() => {
    router.push("/sat/onboarding/quiz");
  }, [router]);

  if (!mounted) return null;

  // Loading state inside the overlay
  if (loading) {
    const loadingOverlay = (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="space-y-4 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-sm text-muted-foreground">
            Loading quiz...
          </p>
        </div>
      </div>
    );
    return createPortal(loadingOverlay, document.body);
  }

  // Completion state inside the overlay
  if (completion) {
    const completionOverlay = (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <QuizCompletion
          {...completion}
          onContinue={() => router.push("/sat/onboarding/schedule")}
        />
      </div>
    );
    return createPortal(completionOverlay, document.body);
  }

  const question = questions[currentIndex];
  if (!question) return null;

  const problem = questionToProblem(question);
  const selectedOption =
    answerState.type === "wrong"
      ? answerState.selectedOption
      : answerState.type === "correct"
        ? answerState.correctOption
        : undefined;

  // Build feedbackState for AnswerPanel
  let feedbackState: FeedbackState | undefined;
  if (answerState.type === "correct") {
    feedbackState = { type: "correct", correctOption: answerState.correctOption };
  } else if (answerState.type === "wrong") {
    feedbackState = { type: "wrong", correctOption: answerState.correctOption };
  }

  const overlay = (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <Toolbar
        displayTime=""
        isLow={false}
        timerHidden={true}
        onToggleTimer={() => {}}
        calcOpen={calcOpen}
        onToggleCalc={() => setCalcOpen((o) => !o)}
        onClose={handleClose}
        hasAnswers={answeredSet.size > 0}
        subtopicName=""
        showTimer={false}
        showCalc={true}
        title="Diagnostic Quiz"
        onSkip={handleSkip}
        skipLabel="Skip quiz"
      />
      <SegmentProgressBar
        total={questions.length}
        currentIndex={currentIndex}
        getStatus={getQuestionStatus}
        onNavigate={() => {}} // No-op: sequential mode
      />
<div className="flex flex-1 overflow-hidden">
        <div className="flex w-full flex-col md:flex-row md:divide-x">
          <QuestionPanel
            problem={problem}
            questionNumber={currentIndex + 1}
          />
          <AnswerPanel
            problem={problem}
            questionNumber={currentIndex + 1}
            selectedOption={selectedOption}
            isMarked={false}
            onSelect={handleAnswer}
            onToggleMark={() => {}}
            direction={direction}
            feedbackState={feedbackState}
            disabled={answerState.type !== "unanswered" || submitting}
            showMark={false}
          >
            {answerState.type !== "unanswered" && (
              <div className="mt-6">
                <ExplanationPanel
                  answerState={answerState}
                  options={question.options}
                />
              </div>
            )}
          </AnswerPanel>
        </div>
      </div>
      <BottomBar
        currentIndex={currentIndex}
        total={questions.length}
        unansweredCount={questions.length - answeredSet.size}
        onBack={() => {}}
        onNext={handleNext}
        onGoTo={() => {}}
        onSubmit={() => {}}
        getStatus={getQuestionStatus}
        sequential={true}
        nextDisabled={answerState.type === "unanswered" || submitting}
        onFinish={handleNext}
      />

      <AnimatePresence>
        {calcOpen && <Calculator />}
      </AnimatePresence>

      <LessonPreferenceModal
        open={showPreferenceModal}
        onSelect={handlePreferenceSelect}
      />
    </div>
  );

  return createPortal(overlay, document.body);
}
