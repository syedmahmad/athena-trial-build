"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Play,
  Send,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import type { WhiteboardStep } from "@/types/whiteboard";
import { cn } from "@/lib/utils";
import { useQuizRouteContext } from "@/components/learning/quiz/quiz-route-context";
import { ResultsScreen } from "@/components/quiz/results-screen";
import { PostLessonPractice } from "@/components/learning/post-lesson-practice";
import { MathContent } from "@/components/quiz/math-content";
import { ObservationFrame } from "@/components/learning/observation/observation-frame";
import { ObservationOrb } from "@/components/learning/observation/observation-orb";
import { PresenceLayer } from "@/components/learning/observation/presence-layer";
import type { StepFocus } from "@/components/whiteboard/pen-tip";
import { IsoContourFrame } from "@/components/learning/observation/iso-contour-frame";
import { WhiteboardCanvas } from "@/components/whiteboard/whiteboard-canvas";
import { MobileLessonRenderer } from "@/components/whiteboard/mobile/mobile-lesson-renderer";
import { useLessonViewport } from "@/hooks/use-lesson-viewport";
import { ChatOverlay } from "@/components/learning/chat-overlay";
import { useSound } from "@/hooks/useSound";
import { stripTtsNoise } from "@/hooks/use-question-narration";
import { useNarrationContext } from "@/components/learning/quiz/narration-provider";
import { pickCorrectPhrase, pickEncouragementPhrase } from "@/lib/encouragement-phrases";
import { CorrectConfetti } from "@/components/learning/practice/practice-whiteboard";
import { useLessonChat } from "@/hooks/use-lesson-chat";
import { useSpecializedPractice } from "@/hooks/use-specialized-practice";
import { useVoiceActivity, type VoiceActivityState } from "@/hooks/use-voice-activity";
import { deriveVoiceListeningState } from "@/lib/voice/voice-listening-state";
import { matchByRegex, matchByLLM, looksLikeQuestionOrComment } from "@/lib/voice/answer-matcher";
import { cleanTranscript, isAmbientNoiseTranscript } from "@/lib/voice/transcript-filters";
import { isCloseIntent } from "@/lib/voice/close-intent";
import { noCopyProps } from "@/lib/quiz/no-copy";
import { Button } from "@/components/ui/button";
import type { Problem } from "@/components/quiz/types";

/**
 * SAT quiz per-problem page, restyled to match the micro-lesson practice
 * aesthetic. Renders ONE problem at a time using the observation chrome
 * (frame + orb + caption pill + whiteboard canvas + bottom interaction
 * pane), and drives the existing QuizRouteContext state machine so the
 * tutor sub-route, save-on-submit, and feedback bookkeeping continue to
 * work unchanged.
 */

// `useNarration` and `stripTtsNoise` migrated to the shared
// `useQuestionNarration` hook in `src/hooks/use-question-narration.ts`
// so the quiz, practice surfaces, and tutor practice card all share
// the same TTS plumbing — including the new `interruptible` option
// (so an answer click cuts the question without cutting a hint or
// encouragement).

// ── Options grid (mirrors PracticePane styling) ───────────────────────────

type OptionsGridProps = {
  problem: Problem;
  wrongIndices: Set<number>;
  isRevealed: boolean;
  disabled: boolean;
  onSelect: (index: number) => void;
};

function OptionsGrid({
  problem,
  wrongIndices,
  isRevealed,
  disabled,
  onSelect,
}: OptionsGridProps) {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {problem.options.map((option, i) => {
        const isRight = i === problem.correctOption;
        const isWrong = wrongIndices.has(i);
        const showCorrect = isRevealed && isRight;

        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            disabled={disabled || isRevealed || isWrong}
            className={cn(
              "flex w-full items-start gap-2.5 rounded-lg border border-[var(--obs-border)] bg-[var(--obs-bg)]/30 px-3 py-2 text-left text-sm text-[var(--obs-fg)] transition-colors",
              !isRevealed &&
                !isWrong &&
                !disabled &&
                "hover:bg-[var(--obs-surface)] hover:border-[var(--obs-glow-mid)]/50 cursor-pointer",
              showCorrect && "border-green-500 bg-green-500/10",
              isRevealed && !isRight && wrongIndices.has(i) &&
                "border-red-500 bg-red-500/10",
              isRevealed && !isRight && !wrongIndices.has(i) && "opacity-50",
              !isRevealed && isWrong && "border-red-500/50 bg-red-500/5 opacity-60",
            )}
            style={
              showCorrect
                ? { boxShadow: "0 0 12px rgba(34, 197, 94, 0.3)" }
                : undefined
            }
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-xs font-medium mt-0.5 text-[var(--obs-muted)]",
                showCorrect && "border-green-500 bg-green-500 text-white",
                isWrong && "border-red-500 bg-red-500 text-white",
              )}
            >
              {showCorrect ? (
                <Check className="h-3 w-3" />
              ) : isWrong ? (
                <X className="h-3 w-3" />
              ) : (
                String.fromCharCode(65 + i)
              )}
            </span>
            <span className="flex-1 leading-relaxed" {...noCopyProps}>
              <MathContent content={option} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Mic toggle (always-listening voice) ───────────────────────────────────

/**
 * Microphone chip for the always-listening voice answer flow. Icon +
 * border colour convey the VAD state; click toggles mute. Mirrors the
 * micro-lesson transport-row mic button so the affordance reads the same
 * across surfaces.
 */
function MicToggle({
  state,
  muted,
  onToggle,
}: {
  state: VoiceActivityState;
  muted: boolean;
  onToggle: () => void;
}) {
  const failed = state === "denied" || state === "error";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={muted ? "Unmute microphone" : "Mute microphone"}
      title={
        state === "denied"
          ? "Mic blocked"
          : state === "error"
            ? "Mic error"
            : muted
              ? "Mic off — click to answer by voice"
              : state === "hearing"
                ? "Hearing you — click to mute"
                : state === "listening"
                  ? "Mic on — click to mute"
                  : "Mic starting…"
      }
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors",
        failed
          ? "border-red-500/50 text-red-400"
          : muted
            ? "border-[var(--obs-border)] text-[var(--obs-muted)] hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)]"
            : state === "hearing"
              ? "border-[var(--obs-glow-mid)] bg-[var(--obs-glow-mid)]/10 text-[var(--obs-fg)]"
              : "border-[var(--obs-border)] text-[var(--obs-fg)] hover:border-[var(--obs-glow-mid)]",
      )}
    >
      {muted || failed ? (
        <MicOff className="h-4 w-4" />
      ) : (
        <Mic
          className={cn("h-4 w-4", state === "hearing" && "animate-pulse")}
        />
      )}
    </button>
  );
}

// ── Main page ────────────────────────────────────────────────────────────

export function QuizProblemPageContent() {
  const router = useRouter();
  const isMobilePortrait = useLessonViewport() === "mobile-portrait";
  const searchParams = useSearchParams();
  // ?debug=orb — roaming "living" orb. Off = fixed corner orb.
  const debugOrb = (searchParams.get("debug") ?? "").split(",").map((s) => s.trim()).includes("orb");
  // Preserve the current query string (e.g. ?debug=orb) across problem-to-
  // problem navigation so the flag survives the [problemNumber] remount.
  const queryString = searchParams.toString();
  const withQuery = useCallback(
    (path: string) => (queryString ? `${path}?${queryString}` : path),
    [queryString],
  );
  const stepFocusRef = useRef<StepFocus | null>(null);
  const handleStepFocus = useCallback((f: StepFocus | null) => {
    stepFocusRef.current = f;
  }, []);
  const params = useParams<{
    problemNumber: string;
    topicSlug?: string;
    subtopicSlug?: string;
    topicId?: string;
  }>();
  const problemNum = Math.max(1, parseInt(params.problemNumber, 10) || 1);
  const {
    problems,
    topicName,
    subtopicName,
    subject,
    basePath,
    enablePostQuizPractice,
    targetCount,
    isGenerating,
    satFocused,
    quiz,
    timer,
    feedbackMap,
    lockedIds,
    setSaveStatus,
    setFeedbackMap,
    setLockedIds,
    handleSelectAnswer,
    quizSessionId,
  } = useQuizRouteContext();

  const specializedPractice = useSpecializedPractice();

  const [showPractice, setShowPractice] = useState(false);
  const [practiceCompleted, setPracticeCompleted] = useState(false);
  const [transientCaption, setTransientCaption] = useState<string | null>(null);
  // Set when the 2nd wrong escalates to an in-place tutor takeover.
  // Drives a hidden seed prompt into the quiz-chat agent + replaces
  // the options grid with "Explain more" / "Got it" buttons. Keyed by
  // problem id so a stale takeover from a prior question is dropped if
  // the student happens to navigate back.
  const [takeoverProblemId, setTakeoverProblemId] = useState<string | null>(
    null,
  );
  // Per-problem wrong-index set so the grid can keep "X" markers on
  // previously-wrong options after the provider's 2s feedback flash
  // clears. Keyed by problem id; reset when the problem changes.
  const [wrongByProblem, setWrongByProblem] = useState<
    Map<string, Set<number>>
  >(new Map());
  // Free-text input shown beneath the takeover action buttons. Lets
  // the student ask a follow-up question instead of being stuck with
  // only "Explain more" / "Got it". Sent through the same chat hook
  // (visible message, not hidden) so the agent treats it as a
  // student turn and the conversation history stays coherent.
  const [chatInput, setChatInput] = useState("");
  const chatTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Narration is hosted by NarrationProvider in the persistent quiz layout —
  // NOT a page-local hook — so the audio survives this page's remount on
  // /quiz/[n] -> /quiz/[n+1] navigation and plays to completion instead of
  // being paused mid-sentence by the unmount cleanup. The provider also owns
  // the master `audioEnabled` toggle (persisted) for the same reason — page
  // state would reset to ON every problem.
  const {
    orbState,
    play: playNarration,
    cancel: stopNarration,
    audioEnabled,
    toggleAudio,
  } = useNarrationContext();
  // Read in narration-gating effects/callbacks so a toggle doesn't re-fire
  // them (we don't want to re-narrate on toggle); only NEW narration triggers
  // — next problem, next wrong answer — observe the current value.
  const audioEnabledRef = useRef(audioEnabled);
  audioEnabledRef.current = audioEnabled;
  const sound = useSound();

  const { mutate: fetchSummary, data: aiSummary } = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/lesson-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicName,
          subtopicName,
          lessonType: "quiz",
          score: { correct: quiz.score, total: problems.length },
        }),
      });
      if (!res.ok) throw new Error("Failed to generate summary");
      return res.json() as Promise<{
        greeting: string;
        summary: string;
        encouragement: string;
      }>;
    },
  });

  const quizBase = `${basePath}/quiz`;

  // On first mount: sync quiz state to URL param. On subsequent index
  // changes: sync URL to quiz state (handles advancing questions).
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!syncedRef.current) {
      syncedRef.current = true;
      const targetIndex = problemNum - 1;
      if (
        targetIndex !== quiz.currentIndex &&
        targetIndex >= 0 &&
        targetIndex < problems.length
      ) {
        quiz.goTo(targetIndex);
      }
      return;
    }
    router.push(withQuery(`${quizBase}/${quiz.currentIndex + 1}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz.currentIndex]);

  const currentProblem = problems[quiz.currentIndex];
  const questionPhase = currentProblem
    ? quiz.getQuestionPhase(currentProblem.id)
    : "question";
  const feedback = currentProblem
    ? feedbackMap.get(currentProblem.id)
    : undefined;
  const isCorrect = feedback?.type === "correct";
  const isWrongLatest = feedback?.type === "wrong";
  const wrongCount = currentProblem ? quiz.getWrongCount(currentProblem.id) : 0;
  const selectedOption = currentProblem
    ? quiz.answers.get(currentProblem.id)
    : undefined;
  const isLocked = currentProblem ? lockedIds.has(currentProblem.id) : false;
  // While problems are still streaming in, the loaded tail is NOT the real
  // last problem — gating on !isGenerating stops the auto-submit / "Got it"
  // submit paths from ending a streaming quiz early.
  const isLastProblem =
    !isGenerating && quiz.currentIndex === problems.length - 1;
  // Progress denominator: show the target while streaming so the bar doesn't
  // rubber-band as the pool grows; fall back to the actual count once done
  // (or when no target was given — static quiz).
  const effectiveTotal = isGenerating
    ? targetCount ?? problems.length
    : problems.length;
  const wrongIndices = useMemo<Set<number>>(() => {
    if (!currentProblem) return new Set();
    return wrongByProblem.get(currentProblem.id) ?? new Set();
  }, [currentProblem, wrongByProblem]);

  // Sync wrong-index tracking with the provider's feedback flashes.
  // When feedback flips to `wrong` for the current problem, capture
  // the option that was just selected. The provider stores the
  // selection on `quiz.answers` (last-pick wins).
  const lastSyncedWrongRef = useRef<{ problemId: string; option: number } | null>(
    null,
  );
  useEffect(() => {
    if (!currentProblem) return;
    if (!isWrongLatest || selectedOption === undefined) return;
    const sig = lastSyncedWrongRef.current;
    if (sig && sig.problemId === currentProblem.id && sig.option === selectedOption) {
      return;
    }
    lastSyncedWrongRef.current = {
      problemId: currentProblem.id,
      option: selectedOption,
    };
    setWrongByProblem((prev) => {
      const next = new Map(prev);
      const existing = next.get(currentProblem.id) ?? new Set<number>();
      if (existing.has(selectedOption)) return prev;
      const merged = new Set(existing);
      merged.add(selectedOption);
      next.set(currentProblem.id, merged);
      return next;
    });
  }, [currentProblem, isWrongLatest, selectedOption]);

  // Auto-submit when user answers correctly on the LAST problem. The
  // QuizLayoutProvider's handleSelectAnswer fires `quiz.goNext()` after
  // a 1.2s delay, but `goNext` is a no-op at last index, so the quiz
  // would stall without an explicit submit here. We mirror the same
  // delay so feedback flashes the same way.
  //
  // `quiz` is a fresh object every render (useQuizState isn't memoized) and
  // the 1s quiz-timer tick re-renders the provider, so depending on `quiz`
  // here churned the effect every second — the cleanup cleared the 1.2s
  // timer before it could fire and the ref guard blocked rescheduling, so
  // the last problem never auto-submitted. Read `quiz` through a ref and
  // depend only on the stable booleans so the timer survives render churn.
  const quizRef = useRef(quiz);
  quizRef.current = quiz;
  const submittedOnLastRef = useRef(false);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isLastProblem) {
      submittedOnLastRef.current = false;
      if (submitTimerRef.current) {
        clearTimeout(submitTimerRef.current);
        submitTimerRef.current = null;
      }
      return;
    }
    if (!isCorrect || submittedOnLastRef.current) return;
    submittedOnLastRef.current = true;
    // Store the timer in a ref and do NOT clear it from this effect's
    // cleanup. The provider deletes the "correct" feedback at the same 1200ms
    // mark (flipping isCorrect -> false), which re-runs this effect; a cleanup
    // that cleared the timer would cancel the pending submit in that race.
    // The timer is cleared only when we actually leave the last problem
    // (branch above) or on unmount (effect below).
    submitTimerRef.current = setTimeout(() => {
      submitTimerRef.current = null;
      quizRef.current.submit();
    }, 1200);
  }, [isLastProblem, isCorrect]);
  useEffect(
    () => () => {
      if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    },
    []
  );

  // Fetch AI summary when quiz is submitted
  const summaryFetchedRef = useRef(false);
  useEffect(() => {
    if (quiz.phase === "submitted" && !summaryFetchedRef.current) {
      summaryFetchedRef.current = true;
      fetchSummary();
    }
  }, [quiz.phase, fetchSummary]);

  // ── Tutor takeover (replaces the StuckModal escalation) ───────────────
  //
  // On the 2nd wrong, the per-problem flow used to fire a StuckModal that
  // routed to `/quiz/[N]/tutor`. We now keep the student on this page and
  // overlay a tutor chat using the same takeover pattern as the
  // micro-lesson's `predict` / `check_in` / `fill_blank` 2nd-wrong path.
  // The tutor agent grounds its walkthrough in the current SAT problem
  // (questionText, options, correct answer, hint, solution steps) via
  // `/api/agent/quiz-chat/stream`.
  const chat = useLessonChat({
    topic: topicName,
    subtopic: subtopicName,
    lessonContent: "",
    satFocused,
    variant: "quiz",
    chatStreamUrl: "/api/agent/quiz-chat/stream",
    quizContext: currentProblem
      ? {
          questionText: currentProblem.questionText,
          options: currentProblem.options,
          hint: currentProblem.hint,
          solutionSteps: currentProblem.solutionSteps,
          correctOption: currentProblem.correctOption,
          studentAnswer: selectedOption,
        }
      : undefined,
  });

  const isTakeoverActive =
    !!currentProblem && takeoverProblemId === currentProblem.id;

  // Master audio toggle gates the AI-tutor takeover narration too. Hard-
  // disable (skip TTS entirely) rather than volume-mute, so audio-off burns
  // no ElevenLabs quota and the orb stays idle. Toggling off mid-walkthrough
  // also stops the in-flight step audio. setNarrationDisabled / stopAudio are
  // stable useCallbacks, so this only re-runs when audioEnabled flips.
  const { setNarrationDisabled: setChatNarrationDisabled, stopAudio: stopChatAudio } =
    chat;
  useEffect(() => {
    setChatNarrationDisabled(!audioEnabled);
    if (!audioEnabled) stopChatAudio();
  }, [audioEnabled, setChatNarrationDisabled, stopChatAudio]);

  // Trigger the takeover when the question enters its tutor phase
  // (i.e. the 2nd wrong). One-shot per problem — `takeoverProblemId`
  // gates the seed prompt + chat reset.
  const lastSeededTakeoverRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentProblem) return;
    if (questionPhase !== "tutor") return;
    if (lastSeededTakeoverRef.current === currentProblem.id) return;
    lastSeededTakeoverRef.current = currentProblem.id;

    // Stop any in-flight hint narration so the tutor doesn't talk over
    // the student's previous wrong-answer hint.
    stopNarration();
    setTransientCaption(null);
    setTakeoverProblemId(currentProblem.id);

    const correctLetter = String.fromCharCode(
      65 + currentProblem.correctOption,
    );
    const correctValue = currentProblem.options[currentProblem.correctOption];
    const studentLetter =
      selectedOption !== undefined
        ? String.fromCharCode(65 + selectedOption)
        : "(no selection)";
    const studentValue =
      selectedOption !== undefined
        ? currentProblem.options[selectedOption]
        : "(no selection)";
    const stepsText = currentProblem.solutionSteps
      .map((s) => `${s.step}. ${s.instruction} ${s.math}`)
      .join("\n");
    const seed =
      `The student got this question wrong twice and needs you to walk them through it.\n` +
      `Question: ${currentProblem.questionText}\n` +
      `Options: ${currentProblem.options
        .map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`)
        .join("  ")}\n` +
      `Their last answer: ${studentLetter}) ${studentValue}\n` +
      `Correct answer: ${correctLetter}) ${correctValue}\n` +
      `Hint: ${currentProblem.hint}\n` +
      `Reference solution:\n${stepsText}\n\n` +
      `Walk them through this conversationally, building intuition. ` +
      `Acknowledge where their thinking might have gone off track and ` +
      `lead them to the correct answer step by step.`;
    chat.sendChat(seed, { hidden: true });
  }, [
    questionPhase,
    currentProblem,
    selectedOption,
    chat,
    stopNarration,
  ]);

  // Reset the seed gate + close the takeover when the student moves to
  // a different problem. Stops any in-flight chat narration so it
  // doesn't bleed into the next question.
  useEffect(() => {
    if (!currentProblem) return;
    if (
      lastSeededTakeoverRef.current &&
      lastSeededTakeoverRef.current !== currentProblem.id
    ) {
      lastSeededTakeoverRef.current = null;
    }
    if (takeoverProblemId && takeoverProblemId !== currentProblem.id) {
      setTakeoverProblemId(null);
      chat.clearChat();
    }
  }, [currentProblem, takeoverProblemId, chat]);

  const handleExplainMore = useCallback(() => {
    chat.explainMore();
  }, [chat]);

  // Free-text follow-up during takeover. Routes through
  // `chat.askFollowup`, which mirrors `explainMore`: the prior tutor
  // turn is summarised into a hidden anchor block + directive
  // attached to the backend payload, but the visible chat bubble
  // shows only the student's typed text. Canvas content is preserved.
  const handleChatSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = chatInput.trim();
      if (!text || chat.isProcessing) return;
      setChatInput("");
      chat.askFollowup(text);
    },
    [chat, chatInput],
  );

  const handleChatKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleChatSubmit(e as unknown as React.FormEvent);
      }
    },
    [handleChatSubmit],
  );

  // "Got it" — close the takeover, mark the problem revealed-as-wrong,
  // lock further input on it, and advance. Mirrors the OLD 2-wrong
  // outcome (the original flow ended in `/quiz/[N]/tutor`, where
  // closing the tutor without getting the answer right also left the
  // problem in a wrong/locked state). On the last problem we submit
  // instead of advancing — `quiz.goNext()` is a no-op at the end.
  const handleGotIt = useCallback(() => {
    if (!currentProblem) return;
    setTakeoverProblemId(null);
    chat.clearChat();
    // Moving-on encouragement narration. Same phrase set as the
    // micro-lesson's force-reveal / hint-exhausted paths so the voice
    // is continuous across surfaces. Replaces the negative SFX that
    // previously fired on takeover entry — the spoken line carries
    // the "let's go" cue without sounding like scolding. Marked
    // non-interruptible so the next problem's auto-played question
    // waits for it to finish (queued via pendingQuestionRef).
    if (audioEnabledRef.current) {
      playNarration(pickEncouragementPhrase(), { interruptible: false });
    }
    setLockedIds((prev) => new Set(prev).add(currentProblem.id));
    setFeedbackMap((prev) =>
      new Map(prev).set(currentProblem.id, {
        type: "wrong",
        correctOption: currentProblem.correctOption,
      }),
    );
    if (isLastProblem) {
      // Brief dwell so the "wrong" feedback flashes before we leave.
      setTimeout(() => quiz.submit(), 600);
    } else {
      setTimeout(() => {
        setFeedbackMap((prev) => {
          const next = new Map(prev);
          next.delete(currentProblem.id);
          return next;
        });
        quiz.goNext();
      }, 800);
    }
  }, [
    currentProblem,
    chat,
    isLastProblem,
    quiz,
    setFeedbackMap,
    setLockedIds,
    playNarration,
  ]);

  // ── Always-listening voice answers (Silero VAD) ──────────────────────────
  //
  // Mirrors the micro-lesson's voice→answer flow. The mic listens
  // continuously; each utterance is transcribed (STT) and matched against
  // the current problem's options (regex first, LLM fallback) to drive the
  // SAME `handleSelectAnswer` path a tap would. During the tutor takeover
  // the utterance instead routes to the chat agent as a follow-up — or
  // closes the takeover on a "got it".
  //
  // Gated to the personalized quiz for now. `QuizProblemPageContent` is
  // shared with the SAT and my-learning quizzes, which don't opt into a mic
  // prompt — flipping this to `true` would enable voice everywhere.
  const voiceEnabled = basePath.startsWith("/personalized");

  // `useVoiceActivity` locks its callbacks at mount, so the dispatch reads
  // live values through refs rather than re-subscribing the mic every render.
  // (`handleSelectAnswer` in particular is a fresh reference each render — the
  // provider's `quiz` object isn't memoized — so a ref is required.)
  const currentProblemRef = useRef(currentProblem);
  currentProblemRef.current = currentProblem;
  const isTakeoverActiveRef = useRef(isTakeoverActive);
  isTakeoverActiveRef.current = isTakeoverActive;
  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;
  const isCorrectRef = useRef(isCorrect);
  isCorrectRef.current = isCorrect;
  const handleSelectAnswerRef = useRef(handleSelectAnswer);
  handleSelectAnswerRef.current = handleSelectAnswer;
  const handleGotItRef = useRef(handleGotIt);
  handleGotItRef.current = handleGotIt;
  const stopNarrationRef = useRef(stopNarration);
  stopNarrationRef.current = stopNarration;
  const chatRef = useRef(chat);
  chatRef.current = chat;

  const sttInFlightRef = useRef(false);
  const dispatchVoiceUtterance = useCallback(async (audio: Blob) => {
    // Serialize: ignore a new utterance while the previous STT round-trip
    // is still resolving.
    if (sttInFlightRef.current) return;
    sttInFlightRef.current = true;
    try {
      const fd = new FormData();
      fd.append("audio", audio, "utterance.wav");
      const res = await fetch("/api/agent/speech-to-text", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(`STT ${res.status}`);
      const { text } = (await res.json()) as { text?: string };
      const rawTranscript = (text ?? "").trim();
      if (!rawTranscript) return;
      // Drop STT ambient-noise hallucinations ("[Music]", "(coughs)"…).
      if (isAmbientNoiseTranscript(rawTranscript)) {
        console.debug("[quiz voice] dropped ambient transcript:", rawTranscript);
        return;
      }
      // Strip embedded markers ("B (music plays)") while keeping math
      // parens ("(x + 4)") intact.
      const trimmed = cleanTranscript(rawTranscript);
      if (!trimmed) return;

      // ── Tutor takeover: route the utterance to the chat agent ────────
      const activeChat = chatRef.current;
      if (isTakeoverActiveRef.current) {
        // "Got it" / "thanks" closes the takeover and advances — same
        // outcome as the footer button.
        if (isCloseIntent(trimmed)) {
          handleGotItRef.current();
          return;
        }
        if (activeChat.isProcessing) {
          toast.info("Hold on — still answering.");
          return;
        }
        // Cut the tutor's TTS so the follow-up is heard, then ask.
        activeChat.stopAudio?.();
        activeChat.acknowledge?.();
        activeChat.askFollowup(trimmed);
        return;
      }

      // ── Solving view: match the utterance to an option ───────────────
      const problem = currentProblemRef.current;
      if (!problem) return;
      // Already answered correctly / locked — nothing to select by voice.
      if (isCorrectRef.current || isLockedRef.current) return;

      // Regex layer: letter ("B"), ordinal ("the second one"), number,
      // exact / substring option text. High-precision + synchronous.
      const regexIdx = matchByRegex(trimmed, problem.options);
      if (regexIdx !== null) {
        stopNarrationRef.current({ onlyInterruptible: true });
        handleSelectAnswerRef.current(problem.id, regexIdx);
        return;
      }
      // Regex missed. If the utterance doesn't read like a question/
      // comment, let the LLM judge map it to an option ("it's x equals
      // five" → option "x = 5").
      if (!looksLikeQuestionOrComment(trimmed)) {
        const llmIdx = await matchByLLM(
          trimmed,
          problem.options,
          problem.questionText,
        );
        if (llmIdx !== null) {
          stopNarrationRef.current({ onlyInterruptible: true });
          handleSelectAnswerRef.current(problem.id, llmIdx);
          return;
        }
      }
      // No option matched. The solving view has no chat to field a free
      // question, so drop it silently — the student can retry or tap.
      console.debug("[quiz voice] no option match:", trimmed);
    } catch (err) {
      console.error("[quiz voice] STT failed:", err);
      toast.error("Couldn't hear that — try again.");
    } finally {
      sttInFlightRef.current = false;
    }
  }, []);

  // VAD threshold policy via the shared listening-state machine. While a
  // question/hint is narrating (or the tutor is talking during takeover)
  // the echo-resistant threshold applies; once the student is up for an
  // answer the short-answer threshold lets a bare "B" register.
  const voiceListeningState = deriveVoiceListeningState({
    micActive: true,
    isChatting: isTakeoverActive,
    isChatProcessing: chat.isProcessing,
    isChatSpeaking: chat.isSpeaking,
    isChatNarrating: chat.isChatNarrating,
    isLessonNarrating: orbState === "speaking",
    isLessonTtsLoading: orbState === "thinking",
    isAwaitingInteractionAnswer:
      !isTakeoverActive && !isCorrect && !isLocked && !!currentProblem,
  });

  const voice = useVoiceActivity({
    onSpeechRealStart: () => {
      // Barge-in only during the takeover: cut the tutor's TTS so the
      // student's interjection is heard. Question/hint narration is left
      // alone here — `useQuestionNarration` has no resume, so eagerly
      // cutting it for what might still be ambient noise is
      // unrecoverable; the dispatch cancels it once an answer is matched.
      if (isTakeoverActiveRef.current) chatRef.current.stopAudio?.();
    },
    onSpeechEnd: (audio) => dispatchVoiceUtterance(audio),
    onError: (err) => {
      console.error("[quiz voice]", err);
      if (err.name === "NotAllowedError") {
        toast.error(
          "Microphone access denied. Enable it in your browser to answer by voice.",
        );
      }
    },
    listeningState: voiceListeningState,
    // Boot the mic OFF (muted). Stream still opens so turning it on is
    // instant, but VAD stays gated until the user clicks the mic —
    // keeps a noisy room from misfiring the always-listening matcher.
    initialMuted: true,
  });

  // Boot the mic on mount for voice-enabled surfaces; tear it down on
  // unmount. `voice.start`/`voice.stop` are stable across renders.
  const { start: voiceStart, stop: voiceStop } = voice;
  useEffect(() => {
    if (!voiceEnabled) return;
    voiceStart();
    return () => voiceStop();
  }, [voiceEnabled, voiceStart, voiceStop]);

  // ── Caption pill / hint narration ───────────────────────────────────────

  // Reset caption + queue the next question's TTS narration on each
  // problem change. Prefer the model-authored `questionPhonetic`
  // (populated for backfilled rows; future seeds emit it at author
  // time). Fall back to a runtime LaTeX strip of `questionText` for
  // rows not yet backfilled (SAT problems aren't backfilled today —
  // only practice rows are).
  //
  // Why queue rather than play immediately: when the student clicks
  // "Got it" inside the takeover we play a moving-on encouragement
  // narration; if the next problem then mounts and `playNarration`
  // fires straight into the question, it cuts the encouragement off
  // partway through. Instead we stash the next question in
  // `pendingQuestionRef` and let the in-flight narration finish
  // naturally; the orb-state effect below drains the pending text
  // when the orb returns to idle.
  const pendingQuestionRef = useRef<string | null>(null);
  const problemId = currentProblem?.id;
  const problemPhonetic = currentProblem?.questionPhonetic;
  const problemText = currentProblem?.questionText;
  useEffect(() => {
    setTransientCaption(null);
    if (!problemId) {
      // No active problem (results screen, etc.) — drop any queued
      // text and let in-flight narration finish on its own terms.
      pendingQuestionRef.current = null;
      return;
    }
    const phonetic =
      problemPhonetic?.trim() ||
      stripTtsNoise(problemText || "").trim();
    if (!phonetic) {
      pendingQuestionRef.current = null;
      return;
    }
    if (!audioEnabledRef.current) {
      // Audio off — don't read the question aloud, and don't queue it.
      pendingQuestionRef.current = null;
    } else if (orbState === "idle") {
      // Nothing playing; start immediately. Question narration is
      // interruptible — clicking an answer cuts it (the student is
      // done listening once they've decided).
      pendingQuestionRef.current = null;
      playNarration(phonetic, { interruptible: true });
    } else {
      // Encouragement / hint / prior question's tail still narrating.
      // Stash the new question; the orb-idle drain below picks it up.
      pendingQuestionRef.current = phonetic;
    }
    // orbState is intentionally NOT a dep — we only want to (re)evaluate
    // when the active problem itself changes. The drain effect below
    // handles orbState transitions for queued playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId]);

  // Drain any queued question narration the moment the orb idles.
  useEffect(() => {
    if (orbState !== "idle") return;
    if (!audioEnabledRef.current) {
      pendingQuestionRef.current = null;
      return;
    }
    const pending = pendingQuestionRef.current;
    if (!pending) return;
    pendingQuestionRef.current = null;
    playNarration(pending, { interruptible: true });
  }, [orbState, playNarration]);

  // Drive the orb caption from feedback / wrong-count / phase changes.
  // First wrong (wrongCount === 1) → surface `hint` via TTS + caption.
  // Tutor entry (wrongCount === 2) is handled by the in-place takeover
  // overlay — let the chat agent's narration speak; clear the inline
  // caption.
  // Correct → flash explanation under the orb during the auto-advance
  // dwell. Wrong → caption + hint narration on the first wrong, takeover
  // on the second. Sound effects fire once per (problemId, kind) pair via
  // `lastSoundRef` so re-renders inside the same feedback state don't
  // re-trigger the chime / buzz.
  const lastNarratedRef = useRef<string | null>(null);
  const lastSoundRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentProblem) return;
    if (isCorrect) {
      const soundKey = `${currentProblem.id}|correct`;
      if (lastSoundRef.current !== soundKey) {
        lastSoundRef.current = soundKey;
        if (audioEnabledRef.current) sound.correct();
      }
      // Short celebratory phrase under the orb — NOT the full
      // problem.explanation. The explanation is the multi-paragraph
      // solution writeup and was visibly dumping a wall of text into
      // the caption pill during the ~1.2s pre-advance window.
      // Mirrors the micro-lesson predict/check_in correct path.
      const phraseKey = `${currentProblem.id}|correct-phrase`;
      if (lastNarratedRef.current !== phraseKey) {
        lastNarratedRef.current = phraseKey;
        const phrase = pickCorrectPhrase();
        setTransientCaption(phrase);
        // Non-interruptible: this is the answer RESPONSE, so it plays to
        // completion. Problem-text/question narration stays interruptible
        // (an answer click cuts it), but once the student has answered, the
        // feedback they hear back should not be clipped — including by a
        // fast click on the next problem after auto-advance. The next
        // question waits behind it via pendingQuestionRef.
        if (audioEnabledRef.current) {
          playNarration(phrase, { interruptible: false });
        }
      }
      return;
    }
    if (isWrongLatest && wrongCount === 1) {
      const soundKey = `${currentProblem.id}|wrong-1`;
      if (lastSoundRef.current !== soundKey) {
        lastSoundRef.current = soundKey;
        if (audioEnabledRef.current) sound.wrong();
      }
      const t = currentProblem.hint?.trim();
      if (t) {
        setTransientCaption(t);
        const key = `${currentProblem.id}|hint`;
        if (lastNarratedRef.current !== key) {
          lastNarratedRef.current = key;
          // Hint plays through to completion — answer-clicks should
          // not cut a coaching line. The next problem's question
          // queue waits for orb-idle before starting.
          if (audioEnabledRef.current) {
            playNarration(t, { interruptible: false });
          }
        }
      }
      return;
    }
    if (isWrongLatest && wrongCount >= 2) {
      // No negative SFX on takeover entry. The chat takeover begins
      // explaining; an "incorrect" buzz on top of an explanation reads
      // as scolding. The encouragement narration on "Got it" carries
      // the moving-on cue instead. Mirrors the micro-lesson rule
      // ("No negative SFX; the encouragement narration carries the cue").
      setTransientCaption(null);
      return;
    }
    // Otherwise: leave the caption alone. Feedback flashes clear after
    // ~2s in the provider, but a hint that has already been shown should
    // remain readable under the orb until the next interaction.
  }, [
    currentProblem,
    isCorrect,
    isWrongLatest,
    wrongCount,
    playNarration,
    sound,
  ]);

  // ── Whiteboard scene ────────────────────────────────────────────────────

  const whiteboardSteps = useMemo<WhiteboardStep[]>(() => {
    if (!currentProblem) return [];
    const fromProblem = (
      currentProblem as Problem & { whiteboardSteps?: WhiteboardStep[] }
    ).whiteboardSteps;
    if (fromProblem && fromProblem.length > 0) return fromProblem;
    // The question text is rendered ABOVE the canvas now, so we don't
    // synthesize a question step here — that would duplicate it.
    // Canvas stays empty unless the problem ships its own visual or
    // a takeover swaps in tutor-streamed steps.
    return [];
  }, [currentProblem]);

  const visibleStepIds = useMemo<Set<number>>(
    () => new Set(whiteboardSteps.map((s) => s.id)),
    [whiteboardSteps],
  );

  // Chat-driven canvas: while the takeover overlay is active, the
  // canvas renders the tutor's streamed steps (mirrors the
  // micro-lesson's `isChatting` swap).
  const chatVisibleIds = useMemo<Set<number>>(
    () => new Set(chat.chatWhiteboardSteps.map((s) => s.id)),
    [chat.chatWhiteboardSteps],
  );

  // Drive the orb from the chat narrator while the takeover is active —
  // matches the micro-lesson's behavior so the orb pulses while the
  // tutor is talking. Otherwise defer to the page-local narration's
  // own orb state (hint TTS, idle).
  const displayOrbState: "idle" | "thinking" | "speaking" | "listening" = isTakeoverActive
    ? chat.isProcessing
      ? "thinking"
      : chat.isChatNarrating || chat.isSpeaking
        ? "speaking"
        : "idle"
    : orbState;

  // Caption text mirrors what the tutor is currently saying. When the
  // takeover is active we follow the chat-step narration index — same
  // pattern as the micro-lesson's caption pill. When idle we show the
  // page-local `transientCaption` (hints / explanation flash).
  const takeoverCaption: string | null = useMemo(() => {
    if (!isTakeoverActive) return null;
    const idx = chat.chatNarrationIndex;
    if (idx < 0) return null;
    const step = chat.chatWhiteboardSteps[idx];
    return step?.displayText?.trim() || null;
  }, [isTakeoverActive, chat.chatNarrationIndex, chat.chatWhiteboardSteps]);
  const captionText = isTakeoverActive ? takeoverCaption : transientCaption;

  // ── Render ──────────────────────────────────────────────────────────────

  if (!currentProblem) {
    // No active problem: either the first is still streaming in, or
    // generation finished/failed leaving an empty pool.
    if (problems.length === 0 && isGenerating) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">Generating your quiz…</p>
        </div>
      );
    }
    if (problems.length === 0) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
          <p className="text-sm text-destructive">
            Could not load quiz problems.
          </p>
          <Button variant="outline" size="sm" onClick={() => router.push(basePath)}>
            Go back
          </Button>
        </div>
      );
    }
    return null;
  }

  if (quiz.phase === "submitted") {
    if (showPractice) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <PostLessonPractice
            topic={topicName}
            subtopic={subtopicName}
            subject={subject ?? "math"}
            topicSlug={params.topicSlug}
            subtopicSlug={params.subtopicSlug}
            customTopicId={params.topicId}
            onComplete={() => {
              setShowPractice(false);
              setPracticeCompleted(true);
            }}
          />
        </div>
      );
    }
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <div className="px-6 pt-4 pb-2">
          <Link
            href={satFocused ? "/sat/dashboard" : "/dashboard"}
            className="inline-flex items-center gap-1.5 text-sm font-medium uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
            Dashboard
          </Link>
        </div>
        <div className="flex-1 overflow-hidden">
        <ResultsScreen
          problems={problems}
          answers={quiz.answers}
          score={quiz.score}
          elapsed={timer.elapsed}
          aiSummary={aiSummary}
          quizSessionId={quizSessionId}
          onRetry={() => {
            setSaveStatus("idle");
            setFeedbackMap(new Map());
            setLockedIds(new Set());
            setWrongByProblem(new Map());
            setShowPractice(false);
            setPracticeCompleted(false);
            quiz.restart();
            router.push(withQuery(`${quizBase}/1`));
          }}
          onClose={
            !enablePostQuizPractice || practiceCompleted
              ? () =>
                  router.push(
                    // Personalized/specialized sets are ephemeral and
                    // basePath points back at the paste page — send the
                    // learner to the dashboard instead. Other flows close
                    // back to their subtopic (basePath).
                    basePath.startsWith("/personalized")
                      ? satFocused
                        ? "/sat/dashboard"
                        : "/dashboard"
                      : basePath
                  )
              : undefined
          }
          onPractice={
            !enablePostQuizPractice || practiceCompleted
              ? undefined
              : () => setShowPractice(true)
          }
          onPracticeWeakAreas={
            basePath.startsWith("/personalized")
              ? undefined
              : () => {
                  const wrongQuestionTexts = problems
                    .filter((p) => quiz.answers.get(p.id) !== p.correctOption)
                    .map((p) => p.questionText);
                  specializedPractice.startPractice({
                    topicName,
                    subtopicName,
                    wrongQuestionTexts,
                  });
                }
          }
          practiceWeakAreasPending={specializedPractice.isStarting}
        />
        </div>
      </div>
    );
  }

  // Question text + answer grid, rendered identically whether pinned at the
  // top (takeover / problems that ship a visual) or centered as a flashcard
  // (the common SAT case where the canvas would otherwise be empty).
  const questionAndOptions = (
    <>
      <div className="text-base leading-relaxed text-[var(--obs-fg)]" {...noCopyProps}>
        <MathContent content={currentProblem.questionText} size="lg" />
      </div>
      <OptionsGrid
        problem={currentProblem}
        wrongIndices={wrongIndices}
        isRevealed={isCorrect}
        disabled={isLocked || isTakeoverActive}
        onSelect={(i) => {
          stopNarration({ onlyInterruptible: true });
          handleSelectAnswer(currentProblem.id, i);
        }}
      />
    </>
  );

  // Pin the question to the top only when the canvas below is actually in
  // use — the tutor takeover, or a problem that ships its own whiteboard
  // visual. SAT problems ship no visual, so the canvas would be empty and a
  // top-pinned question leaves a big blank gap; center it as a flashcard
  // instead.
  const hasProblemVisual = whiteboardSteps.length > 0;
  const centerFlashcard = !isTakeoverActive && !hasProblemVisual;
  const pinQuestionTop = isTakeoverActive || hasProblemVisual;

  return (
    <div className="dark relative">
      <ObservationFrame
        onBack={() => router.push(satFocused ? "/sat/dashboard" : "/dashboard")}
      >
        {/* Top-right progress strip — sits in the frame's top chrome row
            opposite the BACK affordance. Renders even during takeover so
            the student keeps their place in the quiz. Prev/Next chevrons
            flank the progress bar; goBack/goNext mutate quiz.currentIndex
            which triggers the URL-sync effect (line ~215) to push the new
            route. Per-problem answer state lives in quiz.answers so
            navigating back rehydrates the prior selection automatically.
            `pointer-events-none` on the container so the row stays
            click-through outside the buttons; the buttons themselves
            re-enable pointer-events. */}
        {/* Top-right progress strip — bar + count only. Prev/next moved to
            the centered control bar at the bottom (solving) / transport row
            (takeover). */}
        <div className="pointer-events-none absolute right-8 top-3 z-20 flex items-center gap-2 w-[min(320px,44vw)]">
          <div className="flex-1 h-1 bg-[var(--obs-border)]/40 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--obs-accent)] transition-[width] duration-300"
              style={{
                width: `${(quiz.currentIndex / Math.max(1, effectiveTotal)) * 100}%`,
              }}
            />
          </div>
          <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--obs-muted)] whitespace-nowrap">
            Q {quiz.currentIndex + 1} / {effectiveTotal}
          </span>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* Orb + caption — anchored to the top-left CORNER of the whole
              column so it stays put whether the question is centered (solving
              view) or pinned above the canvas (takeover). It used to live
              inside the canvas region, which sits below the pinned question
              during a takeover and pushed the orb down. */}
          {debugOrb ? (
            <PresenceLayer
              orbState={displayOrbState}
              amplitude={isTakeoverActive ? chat.amplitude : 0}
              size={100}
              captionText={captionText}
              mode="rest"
              restAnchor={{ x: 62, y: 62 }}
              stepFocusRef={stepFocusRef}
            />
          ) : (
          <div className="absolute top-3 left-3 z-20 flex flex-col items-center gap-2 pointer-events-none w-[min(220px,42vw)] origin-top-left scale-[0.65] sm:scale-100">
            <ObservationOrb
              state={displayOrbState}
              amplitude={isTakeoverActive ? chat.amplitude : 0}
              size={100}
            />
            <AnimatePresence mode="wait">
              {captionText ? (
                <motion.div
                  key={captionText}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                  className="obs-serif text-center text-sm leading-snug text-[var(--obs-muted)] rounded-xl px-3 py-1.5 backdrop-blur-md shadow-lg shadow-black/10 border border-white/5"
                  style={{
                    background:
                      "color-mix(in oklch, var(--obs-surface) 70%, transparent)",
                  }}
                >
                  <MathContent content={captionText} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
          )}
          {/* Question + options pinned ABOVE the canvas only when the canvas
              is in use — the tutor's walkthrough during takeover, or a
              problem that ships its own visual. Options stay visible during
              takeover but disable themselves so the student keeps the context
              while the tutor explains. When the canvas would be empty (the
              common SAT case) the question is centered as a flashcard inside
              the canvas region below instead. */}
          {pinQuestionTop && (
            <div className="shrink-0 px-4 pt-3 pb-4 sm:px-8">
              <div className="mx-auto w-full max-w-[720px] space-y-3">
                {questionAndOptions}
              </div>
            </div>
          )}

          {/* Canvas region — orb floats top-left over the iso-contour frame.
              When the tutor takeover is active, ChatOverlay layers its
              affordances over the canvas (no "Resume lesson" pill in
              takeover mode — the only exit is "Got it" in the footer)
              and the canvas swaps to the tutor's streamed steps. */}
          <div className="relative flex-1 min-h-0">
            <ChatOverlay
              isOpen={isTakeoverActive}
              onClose={handleGotIt}
              mode="takeover"
            />

            <IsoContourFrame bottomCenterLabel="" bottomRightLabel="">
              <div className="relative h-full w-full">
                {/* Canvas-level "Correct!" pulse. Lifted out of the
                    bottom pane so the feedback lands where the
                    student is looking. Mirrors the in-lesson
                    check-in / predict / fill_blank pulses and
                    PracticeWhiteboardContent. */}
                <AnimatePresence>
                  {isCorrect && !isTakeoverActive ? (
                    <motion.div
                      key="quiz-correct-pulse"
                      className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <CorrectConfetti />
                      <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 15 }}
                        className="relative z-20 flex items-center gap-2 rounded-full border border-green-500/40 bg-green-500/10 px-4 py-2 shadow-lg shadow-green-500/20 backdrop-blur-md"
                      >
                        <Check className="h-5 w-5 text-green-500" />
                        <span className="text-base font-bold text-green-500">
                          Correct!
                        </span>
                      </motion.div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                {/* Plain opacity cross-fade on problem swap. The
                    previous y:12 spring stacked with the bottom
                    pane's y:8 keyed remount and made the layout
                    visibly shift mid-transition. */}
                <AnimatePresence mode="wait">
                  {isTakeoverActive ? (
                    <motion.div
                      key={`takeover-canvas-${currentProblem.id}`}
                      className="h-full w-full"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}
                    >
                      {isMobilePortrait ? (
                        <div className="h-full w-full overflow-y-auto pt-16">
                          <MobileLessonRenderer
                            steps={chat.chatWhiteboardSteps}
                            visibleStepIds={chatVisibleIds}
                            currentStepIndex={Math.max(
                              0,
                              chat.chatWhiteboardSteps.length - 1,
                            )}
                            stepProgress={1}
                          />
                        </div>
                      ) : (
                        <WhiteboardCanvas
                          steps={chat.chatWhiteboardSteps}
                          visibleStepIds={chatVisibleIds}
                          currentStepIndex={Math.max(
                            0,
                            chat.chatWhiteboardSteps.length - 1,
                          )}
                          stepProgress={1}
                          equalScaleCoords
                          sequentialDiagrams={debugOrb}
                          onStepFocus={debugOrb ? handleStepFocus : undefined}
                        />
                      )}
                    </motion.div>
                  ) : centerFlashcard ? (
                    <motion.div
                      key={`flashcard-${currentProblem.id}`}
                      className="flex h-full w-full flex-col overflow-y-auto px-4 pb-4 pt-16 sm:px-8 sm:pb-8 sm:pt-4"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}
                    >
                      {/* Flashcard: question + answer grid. Centered via
                          m-auto when it fits; the parent scrolls when the
                          question is long so it never spills into the orb or
                          the transport controls. */}
                      <div className="m-auto w-full max-w-[760px] space-y-5">
                        {questionAndOptions}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={currentProblem.id}
                      className="h-full w-full"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.18 }}
                    >
                      {isMobilePortrait ? (
                        <div className="h-full w-full overflow-y-auto pt-16">
                          <MobileLessonRenderer
                            steps={whiteboardSteps}
                            visibleStepIds={visibleStepIds}
                            currentStepIndex={Math.max(0, whiteboardSteps.length - 1)}
                            stepProgress={1}
                          />
                        </div>
                      ) : (
                        <WhiteboardCanvas
                          steps={whiteboardSteps}
                          visibleStepIds={visibleStepIds}
                          currentStepIndex={Math.max(0, whiteboardSteps.length - 1)}
                          stepProgress={1}
                          equalScaleCoords
                          sequentialDiagrams={debugOrb}
                          onStepFocus={debugOrb ? handleStepFocus : undefined}
                        />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </IsoContourFrame>
          </div>

          {/* Bottom control bar (solving view) — centered question nav +
              draw + audio, mirroring the micro-lesson keypad. Replaces the
              small top-right prev/next chevrons. Hidden during the takeover,
              which has its own transport row below. */}
          {!isTakeoverActive && (
            <div className="shrink-0 px-4 py-4 sm:px-8">
              <div className="mx-auto flex w-full max-w-[720px] items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={quiz.goBack}
                  disabled={quiz.currentIndex <= 0}
                  aria-label="Previous question"
                  title="Previous question"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--obs-border)] disabled:hover:text-[var(--obs-muted)]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={quiz.goNext}
                  disabled={quiz.currentIndex >= problems.length - 1}
                  aria-label="Next question"
                  title="Next question"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--obs-border)] disabled:hover:text-[var(--obs-muted)]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={toggleAudio}
                  aria-label={audioEnabled ? "Turn audio off" : "Turn audio on"}
                  aria-pressed={audioEnabled}
                  title={audioEnabled ? "Audio on" : "Audio off"}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)]"
                >
                  {audioEnabled ? (
                    <Volume2 className="h-4 w-4" />
                  ) : (
                    <VolumeX className="h-4 w-4" />
                  )}
                </button>
                {voiceEnabled && (
                  <MicToggle
                    state={voice.state}
                    muted={voice.muted}
                    onToggle={voice.muted ? voice.unmute : voice.mute}
                  />
                )}
              </div>
            </div>
          )}

          {/* Bottom takeover affordance — only renders during an
              active takeover. Holds the "I don't get it" / "Got it"
              action row plus a free-text follow-up input. */}
          {isTakeoverActive && (
            <div className="shrink-0 bg-[var(--obs-surface)] px-4 py-4 sm:px-8">
              <div className="mx-auto w-full max-w-[720px] flex flex-col items-stretch gap-3">
                <div className="flex items-center justify-center gap-3 py-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleExplainMore}
                    disabled={chat.isProcessing}
                    className="min-w-[120px]"
                    aria-busy={chat.isProcessing}
                  >
                    {chat.isProcessing ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Thinking…
                      </>
                    ) : (
                      "I don't get it"
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleGotIt}
                    disabled={chat.isProcessing}
                    className="min-w-[120px] gap-1"
                  >
                    Got it
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {/* Input row — narration transport (skip-back / play-pause /
                    skip-forward) + audio sit in the SAME row as the chat
                    input, mirroring the micro-lesson. */}
                <form
                  onSubmit={handleChatSubmit}
                  className="flex w-full flex-wrap items-center justify-center gap-2"
                >
                  <button
                    type="button"
                    onClick={chat.skipNarrationBack}
                    disabled={!audioEnabled || chat.chatNarrationIndex <= 0}
                    aria-label="Previous step"
                    title="Previous step"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--obs-border)] disabled:hover:text-[var(--obs-muted)]"
                  >
                    <SkipBack className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={chat.toggleNarrationPaused}
                    disabled={!audioEnabled}
                    aria-label={chat.narrationPaused ? "Play" : "Pause"}
                    title={chat.narrationPaused ? "Play" : "Pause"}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--obs-border)] disabled:hover:text-[var(--obs-muted)]"
                  >
                    {chat.narrationPaused ? (
                      <Play className="h-4 w-4" />
                    ) : (
                      <Pause className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={chat.skipNarrationForward}
                    disabled={
                      !audioEnabled ||
                      chat.chatNarrationIndex >=
                        chat.chatWhiteboardSteps.length - 1
                    }
                    aria-label="Next step"
                    title="Next step"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--obs-border)] disabled:hover:text-[var(--obs-muted)]"
                  >
                    <SkipForward className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={toggleAudio}
                    aria-label={audioEnabled ? "Turn audio off" : "Turn audio on"}
                    aria-pressed={audioEnabled}
                    title={audioEnabled ? "Audio on" : "Audio off"}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)]"
                  >
                    {audioEnabled ? (
                      <Volume2 className="h-4 w-4" />
                    ) : (
                      <VolumeX className="h-4 w-4" />
                    )}
                  </button>
                  {voiceEnabled && (
                    <MicToggle
                      state={voice.state}
                      muted={voice.muted}
                      onToggle={voice.muted ? voice.unmute : voice.mute}
                    />
                  )}
                  {/* Input + send drop to their own full-width row on mobile
                      (the transport buttons wrap above), inline at sm+. */}
                  <div className="flex w-full items-center gap-2 sm:w-auto sm:flex-1">
                    <div className="relative flex-1">
                      <textarea
                        ref={chatTextareaRef}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={handleChatKeyDown}
                        placeholder="Ask a follow-up…"
                        className="w-full resize-none rounded-full border border-[var(--obs-border)] bg-[var(--obs-bg)]/30 px-5 py-2.5 text-sm text-[var(--obs-fg)] outline-none placeholder:text-[var(--obs-dim)] focus:border-[var(--obs-glow-mid)]"
                        rows={1}
                        style={{ minHeight: 40, maxHeight: 96 }}
                        disabled={chat.isProcessing}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!chatInput.trim() || chat.isProcessing}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)] disabled:opacity-40"
                      aria-label="Send message"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </ObservationFrame>
    </div>
  );
}
