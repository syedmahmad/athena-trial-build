"use client";

import { useEffect, useState, useRef, useMemo, useCallback, forwardRef, useImperativeHandle } from "react";
import type {
  WhiteboardStep,
  CheckInAction,
  PredictAction,
  FillBlankAction,
  PulseCheckAction,
} from "@/types/whiteboard";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Sparkles, ChevronRight, ChevronDown, ChevronLeft, Check, X,
  Send, Mic, MicOff, Keyboard, CheckCircle, Loader2,
  Play, Pause, Volume2, VolumeX,
  Music, Music2,
  SkipBack, SkipForward,
  Paperclip, PenLine, X as XIcon,
} from "lucide-react";
import { ImageAttachLauncher } from "@/components/image-attach/image-attach-launcher";
import { BoardDrawOverlay } from "@/components/image-attach/board-draw-overlay";
import { useMicroLesson } from "@/hooks/use-micro-lesson";
import { useSpecializedPractice } from "@/hooks/use-specialized-practice";
import { DownloadReportButton } from "@/components/reports/download-report-button";
import { useLessonChat } from "@/hooks/use-lesson-chat";
import { WhiteboardCanvas } from "@/components/whiteboard/whiteboard-canvas";
import { WhiteboardCanvasNoir } from "@/components/whiteboard/whiteboard-canvas-noir";
import { WhiteboardCanvasCorkboard } from "@/components/whiteboard/whiteboard-canvas-corkboard";
import { MobileLessonRenderer } from "@/components/whiteboard/mobile/mobile-lesson-renderer";
import { useLessonViewport } from "@/hooks/use-lesson-viewport";
import { useStepPlayer } from "@/hooks/use-step-player";
import { VoiceOrb } from "@/components/lessons/voice-orb";
import { ObservationFrame } from "@/components/learning/observation/observation-frame";
import { ObservationOrb } from "@/components/learning/observation/observation-orb";
import { PresenceLayer } from "@/components/learning/observation/presence-layer";
import { isDiagramStep, type StepFocus, type OrbSpotlight } from "@/components/whiteboard/pen-tip";
import { IsoContourFrame } from "@/components/learning/observation/iso-contour-frame";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { DogProgress, useDogState } from "@/components/learning/dog-progress";
import { FlyingAnswer } from "@/components/learning/flying-answer";
import { cn } from "@/lib/utils";
import { isEquivalentAnswer, isEquivalentAnswerAsync } from "@/lib/answer-equivalence";
import { toast } from "sonner";
import { useSound } from "@/hooks/useSound";
import {
  pickCorrectPhrase,
  pickEncouragementPhrase,
} from "@/lib/encouragement-phrases";
import { MathContent } from "@/components/quiz/math-content";
import {
  CorrectConfetti,
  PracticePane,
  synthesizeQuestionStep,
  type PracticePaneSavedState,
} from "@/components/learning/practice/practice-whiteboard";
import type { Problem } from "@/components/quiz/types";
import { WhiteboardSkeleton } from "@/components/whiteboard/whiteboard-skeleton";
import { GenerationProgress } from "@/components/lessons/generation-progress";
import { useVoiceActivity } from "@/hooks/use-voice-activity";
import { cleanTranscript, isAmbientNoiseTranscript } from "@/lib/voice/transcript-filters";
import type { WrapUpBeat } from "@/lib/wrap-ups";
import { matchByRegex, matchByLLM, normalizeFillBlankInput, looksLikeQuestionOrComment } from "@/lib/voice/answer-matcher";
import { deriveVoiceListeningState } from "@/lib/voice/voice-listening-state";
import { isCloseIntent } from "@/lib/voice/close-intent";

type MicroLessonProps = {
  topic: string;
  subtopic: string;
  metadata: {
    description?: string;
    learningObjectives?: string[];
    keyFormulas?: { latex: string; description: string }[];
    commonMistakes?: { mistake: string; correction: string; why: string }[];
    tipsAndTricks?: string[];
    conceptualOverview?: {
      definition: string;
      realWorldExample: string;
      satContext: string;
    };
  };
  onClose: () => void;
  practiceProblems?: Problem[];
  /**
   * Optional wrap-up video URL. When set, the lesson plays this video
   * in the canvas slot between the last teaching step and the first
   * practice problem. Skipping (button click) or natural video end both
   * advance to the practice phase. Practice problems are pre-fetched in
   * parallel with the video so they're ready when it finishes.
   *
   * The wrap-up MP4 is silent + caption-free; pair it with
   * `wrapUpNarration` so the script is spoken live by the TTS tutor in
   * the student's chosen voice (and captioned in-app), paced per beat.
   * Without `wrapUpNarration` the video simply plays as-is.
   */
  wrapUpVideoUrl?: string;
  /**
   * Per-beat narration + caption timeline for the wrap-up video (from
   * `@/lib/wrap-ups`). When present alongside `wrapUpVideoUrl`, each
   * beat's `narration` is spoken via `playNarration()` (the chosen
   * voice) and its `caption` rendered as an in-app subtitle; the video
   * is held at each beat boundary until that beat's narration finishes,
   * keeping voice / visuals / caption in sync regardless of voice speed.
   */
  wrapUpNarration?: WrapUpBeat[];
  /**
   * Optional intro video URL. When set, the lesson opens on an "intro"
   * phase that plays this video full-screen in the canvas slot (doors
   * opening + a narrated explanation of the topic) before the first
   * teaching step. The lesson generates in the background while it plays,
   * so generation latency hides behind the intro. Skipping (button) or
   * natural video end both advance into the lesson. Symmetric to
   * `wrapUpVideoUrl`, which plays after the last teaching step.
   */
  introVideoUrl?: string;
  /**
   * Optional ambient background-music URL. When set, a low-volume looping
   * track plays from the lesson phase onward (not during the intro video,
   * which carries its own audio) and a music toggle appears in the bottom
   * controls. Defaults to playing; the student can mute it.
   */
  ambientMusicUrl?: string;
  streamUrl?: string;
  chatStreamUrl?: string;
  existingLesson?: { lessonContent: string; whiteboardSteps: WhiteboardStep[] } | null;
  subtopicApiPath?: string;
  practiceMode?: {
    subject?: "math" | "reading-writing";
    quizStreamUrl?: string;
  };
  tracking?: {
    microLessonId: string;
    subtopicId: string;
  };
  /**
   * Dev-only. When true, the whiteboard canvas ignores the interaction
   * step's own visual and keeps showing the accumulated teaching canvas.
   * Useful for screenshotting a page where a check_in/predict/fill_blank
   * would normally swap the canvas out. Toggled via ?debug=freeze.
   */
  freezeCanvas?: boolean;
  /**
   * Dev-only. Renders a scrubber overlay at the bottom of the lesson
   * letting you drag through the played step history without
   * restarting the whole lesson. Toggled via ?debug=scrub.
   */
  debugScrub?: boolean;
  /**
   * Dev-only. When true, the lesson stays in the "lesson" phase after
   * the final step instead of transitioning into practice problems.
   * Used by the step-stories gallery where each story is a single
   * canned demo and there are no practice problems to follow.
   */
  skipPractice?: boolean;
  /**
   * Experimental. When true, the whiteboard canvas mounts the noir/v2
   * reskin (cinematic-scientific aesthetic) instead of the default
   * canvas. Toggled via ?debug=v2 on the lesson page.
   */
  noirCanvas?: boolean;
  /**
   * Experimental. When true, the whiteboard canvas mounts the
   * corkboard/v3 renderer (red-thread suspect-board with index-card
   * steps). Toggled via ?debug=v3 on the lesson page. Takes
   * precedence over noirCanvas if both are set.
   */
  corkboardCanvas?: boolean;
  /**
   * Experimental. When true, the tutor orb becomes a roaming "living"
   * presence (Clicky-style): it floats around the canvas, reacts to the
   * cursor, docks to the Extra Help panel on tutor takeover, and acts as
   * the pen for drawn diagrams. Toggled via ?debug=orb. When false the orb
   * stays in its fixed top-left corner exactly as before.
   */
  debugOrb?: boolean;
};

/**
 * Remove markup that reads badly when sent to TTS. Primarily strips the
 * `$...$` math delimiters (which voices read as "dollar sign") and a
 * handful of common LaTeX macro wrappers. The visible equation text
 * inside the delimiters stays in the string so it's still readable;
 * non-speakable macro shells like `\textcolor{#hex}{...}` collapse to
 * their inner body.
 */
function stripTtsNoise(text: string): string {
  if (!text) return text;
  let out = text;
  // Collapse \macro[...]{body} style wrappers (including htmlClass, textcolor, cssId, htmlId)
  // to just body. Iterate until stable for nested wrappers.
  for (let i = 0; i < 3; i++) {
    const prev = out;
    out = out.replace(/\\(htmlClass|htmlId|cssId|textcolor|color)\{[^{}]*\}\{([^{}]*)\}/g, "$2");
    if (out === prev) break;
  }
  // Drop the $ delimiters that surround inline math; keep what's inside.
  out = out.replace(/\$([^$]*)\$/g, "$1");
  return out.trim();
}

/**
 * Return the narration text for a whiteboard step. Prefer the authored
 * `narration` field; fall back to the visible question/prompt with
 * LaTeX stripped so TTS doesn't speak "dollar sign". Shared by the
 * arrival narration effect and the voice-driven resume path so both
 * pick from the same source of truth.
 */
function getStepNarrationText(step: WhiteboardStep | undefined): string | undefined {
  if (!step) return undefined;
  if (step.action.type === "check_in") {
    return step.narration?.trim() || stripTtsNoise((step.action as CheckInAction).question);
  }
  if (step.action.type === "predict") {
    return step.narration?.trim() || stripTtsNoise((step.action as PredictAction).question);
  }
  if (step.action.type === "fill_blank") {
    const fb = step.action as FillBlankAction;
    return step.narration?.trim() || stripTtsNoise(fb.prompt ?? fb.question ?? "");
  }
  if (step.action.type === "pulse_check") {
    return step.narration?.trim() || stripTtsNoise((step.action as PulseCheckAction).question);
  }
  return step.narration?.trim();
}

// Phrases live in `src/lib/encouragement-phrases.ts` so the SAT-quiz
// takeover ("Got it") plays the same voice as in-lesson interactions.

const PRACTICE_INTRO_PHRASES = [
  "Practice quiz! Let's see what stuck.",
  "Time for practice. Try a few problems.",
  "Now let's practice. Take your time.",
  "Practice quiz. You've got this.",
];

function pickPracticeIntroPhrase(): string {
  return PRACTICE_INTRO_PHRASES[Math.floor(Math.random() * PRACTICE_INTRO_PHRASES.length)];
}

const PRACTICE_RETRY_PHRASES = [
  "Not quite — give it another shot.",
  "Close. Try again.",
  "Almost. Take another look.",
  "Not this time. Try once more.",
  "Hmm, try a different approach.",
  "Keep at it — try again.",
  "Not quite. You can do this.",
];

function pickPracticeRetryPhrase(): string {
  return PRACTICE_RETRY_PHRASES[Math.floor(Math.random() * PRACTICE_RETRY_PHRASES.length)];
}

// ── Check-in question UI ──────────────────────────────────────────────

function CheckInConfetti() {
  const colors = [
    "hsl(var(--green))",
    "hsl(var(--blue))",
    "hsl(var(--yellow))",
    "hsl(var(--pink))",
    "hsl(var(--orange))",
  ];
  const particles = Array.from({ length: 14 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 0.4,
    size: 3 + Math.random() * 3,
    color: colors[i % colors.length],
  }));
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            bottom: "30%",
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
          }}
          initial={{ y: 0, opacity: 1 }}
          animate={{
            y: -180 - Math.random() * 120,
            opacity: [1, 1, 0],
            x: (Math.random() - 0.5) * 80,
          }}
          transition={{
            duration: 1.2 + Math.random() * 0.4,
            delay: p.delay,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

/**
 * Imperative handles exposed by the interaction cards so the voice
 * dispatch can drive them. Multiple-choice cards (CheckIn / Predict)
 * implement `selectByIndex`; fill-blank implements `setText`. Both
 * methods are optional so a single ref type covers all three cards.
 */
export type InteractionCardHandle = {
  selectByIndex?: (index: number) => void;
  setText?: (text: string) => void;
};

const CheckInCard = forwardRef<InteractionCardHandle, {
  checkIn: CheckInAction;
  onAnswer: (wasCorrect: boolean) => void;
  onNarrate?: (text: string) => void;
  onReveal?: (reveal: { correct: boolean; body: string }) => void;
  onTakeover?: (ctx: {
    question: string;
    studentAnswer: string;
    correctAnswer: string;
    explanation: string;
    hint?: string;
    detailedHint?: string;
  }) => void;
  onCaption?: (text: string) => void;
  onWrong?: () => void;
}>(function CheckInCard({
  checkIn,
  onAnswer,
  onNarrate,
  onReveal,
  onTakeover,
  onCaption,
  onWrong,
}, ref) {
  const [phase, setPhase] = useState<"answering" | "hinted" | "detailed" | "revealed">("answering");
  const [selected, setSelected] = useState<number | null>(null);
  const [wrongIndices, setWrongIndices] = useState<Set<number>>(new Set());
  const answeredRef = useRef(false);
  const sound = useSound();

  const isCorrect = selected === checkIn.correctOption;
  const isRevealed = phase === "revealed";

  const reveal = (correct: boolean) => {
    setPhase("revealed");
    const body = correct
      ? checkIn.explanation
      : `Answer: ${checkIn.options[checkIn.correctOption]}\n\n${checkIn.explanation}`;
    onReveal?.({ correct, body });
  };

  const handleSelect = (index: number) => {
    if (isRevealed) return;
    if (wrongIndices.has(index)) return; // can't re-pick a wrong answer

    setSelected(index);

    if (index === checkIn.correctOption) {
      sound.achievement();
      reveal(true);
      onNarrate?.(pickCorrectPhrase());
      return;
    }

    // Wrong answer — progressive gradient. The encouragement
    // narration plays via TTS; no negative SFX so the student isn't
    // double-cued (sound + narration) on the same beat.
    onWrong?.();
    const next = new Set(wrongIndices);
    next.add(index);
    setWrongIndices(next);

    // Force-reveal triggers when this wrong answer exhausts the wrong
    // options (size of wrongIndices >= options.length - 1). Takeover
    // also fires on the 2nd wrong even when more options remain — at
    // that point the student is unlikely to find the answer alone.
    const willForceReveal = next.size >= checkIn.options.length - 1;
    const shouldTakeover = next.size >= 2 || willForceReveal;

    if (shouldTakeover && onTakeover) {
      // 2nd-or-later wrong — escalate to the tutor walkthrough overlay.
      // "Got it" will advance the lesson.
      onNarrate?.(pickEncouragementPhrase());
      onTakeover({
        question: checkIn.question,
        studentAnswer: checkIn.options[index],
        correctAnswer: checkIn.options[checkIn.correctOption],
        explanation: checkIn.explanation,
        hint: checkIn.hint,
        detailedHint: checkIn.detailedHint,
      });
    } else if (willForceReveal) {
      // Defensive fallback when takeover isn't wired.
      reveal(false);
      onNarrate?.(pickEncouragementPhrase());
    } else {
      // Non-final wrong — show inline hint on the FIRST occurrence
      // and let the student retry. Subsequent wrongs (`phase` already
      // "hinted") play an encouragement phrase instead of replaying
      // the same hint — the student already heard it; a repeat reads
      // as the system being stuck rather than guiding.
      const alreadyHinted = phase === "hinted";
      setPhase("hinted");
      const hintText = checkIn.hint?.trim();
      if (alreadyHinted || !hintText) {
        onNarrate?.(pickEncouragementPhrase());
      } else {
        onNarrate?.(hintText);
        onCaption?.(hintText);
      }
    }
  };

  // Auto-advance after reveal — pass actual correctness up. Mirrors
  // PredictCard / FillBlankCard so the answer-callout has time to land
  // on canvas while narration plays, then advances when narration ends.
  useEffect(() => {
    if (isRevealed && !answeredRef.current) {
      answeredRef.current = true;
      onAnswer(isCorrect);
    }
  }, [isRevealed, isCorrect, onAnswer]);

  // Imperative handle — lets the parent (voice dispatch) drive option
  // selection through the same path as a click. The ref method always
  // calls the LATEST handleSelect (it captures fresh state via the
  // ref-of-fn pattern), so wrongIndices / phase / isRevealed are
  // up-to-date when voice triggers a selection mid-utterance.
  const handleSelectRef = useRef(handleSelect);
  handleSelectRef.current = handleSelect;
  useImperativeHandle(ref, () => ({
    selectByIndex: (i: number) => handleSelectRef.current(i),
  }), []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-3 relative"
    >
      {isRevealed && isCorrect && <CheckInConfetti />}
      {/* text-base for readability — feedback round 1 + 2 noted check_in
          question text was too small. MathContent inherits the size and
          scales the KaTeX with it. */}
      <div className="text-lg font-medium text-foreground">
        <MathContent content={checkIn.question} size="lg" />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {checkIn.options.map((option, i) => {
          const isThis = selected === i;
          const isRight = i === checkIn.correctOption;
          const isWrong = wrongIndices.has(i);
          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={isRevealed || isWrong}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-lg transition-colors",
                !isRevealed && !isWrong && "hover:bg-muted cursor-pointer",
                isRevealed && isRight && "border-green-500 bg-green-500/10",
                isRevealed && isThis && !isRight && "border-red-500 bg-red-500/10",
                isRevealed && !isThis && !isRight && "opacity-50",
                isWrong && !isRevealed && "border-red-500/50 bg-red-500/5 opacity-60",
              )}
              style={
                isRevealed && isRight
                  ? { boxShadow: "0 0 12px rgba(34, 197, 94, 0.3)" }
                  : undefined
              }
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
                {isRevealed && isRight ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (isRevealed && isThis && !isRight) || isWrong ? (
                  <X className="h-3 w-3 text-red-500" />
                ) : (
                  String.fromCharCode(65 + i)
                )}
              </span>
              <span className="flex-1 text-left">
                <MathContent content={option} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Hint + detailed hint + revealed answer render in the canvas flow
          as callouts; the card itself only carries the question + choices. */}
    </motion.div>
  );
});

// ── Predict question UI ──────────────────────────────────────────────

const PredictCard = forwardRef<InteractionCardHandle, {
  predict: PredictAction;
  onAnswer: (wasCorrect: boolean) => void;
  onNarrate?: (text: string) => void;
  onHintPhase?: (phase: "none" | "hinted" | "detailed") => void;
  onReveal?: (reveal: { correct: boolean; body: string }) => void;
  onTakeover?: (ctx: {
    question: string;
    studentAnswer: string;
    correctAnswer: string;
    explanation: string;
    hint?: string;
  }) => void;
  onCaption?: (text: string) => void;
  onWrong?: () => void;
}>(function PredictCard({
  predict,
  onAnswer,
  onNarrate,
  onHintPhase,
  onReveal,
  onTakeover,
  onCaption,
  onWrong,
}, ref) {
  const [selected, setSelected] = useState<number | null>(null);
  const [wrongIndices, setWrongIndices] = useState<Set<number>>(new Set());
  const [showHint, setShowHint] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // Tracked separately from `revealed` so a force-reveal (student
  // exhausted all options) doesn't pretend they got it right. The
  // green-correct UI keys on this ref being false.
  const [forceRevealed, setForceRevealed] = useState(false);
  const answeredRef = useRef(false);
  const sound = useSound();

  const handleSelect = (index: number) => {
    if (revealed || wrongIndices.has(index)) return;
    setSelected(index);

    if (index === predict.correctOption) {
      sound.achievement();
      setRevealed(true);
      onReveal?.({ correct: true, body: predict.explanation });
      onNarrate?.(pickCorrectPhrase());
      return;
    }

    // Wrong — disable this option, show hint, let student retry remaining.
    // No negative SFX; the encouragement narration carries the cue.
    onWrong?.();
    const next = new Set(wrongIndices);
    next.add(index);
    setWrongIndices(next);

    // Mutually-exclusive branch: if THIS wrong click also exhausts all
    // wrong options, go straight to force-reveal + encouragement.
    // Otherwise (still options remaining), surface a hint if one
    // exists. Firing both narrations back-to-back races the
    // advance-on-narration-end watcher and can cut the encouragement
    // off mid-phrase.
    const wrongCount = next.size;
    const willForceReveal = wrongCount >= predict.options.length - 1;
    // Takeover fires on the 2nd wrong even when more options remain —
    // at that point the student is unlikely to find the answer alone.
    const shouldTakeover = wrongCount >= 2 || willForceReveal;
    if (shouldTakeover && onTakeover) {
      // 2nd-or-later wrong — escalate to the tutor walkthrough overlay.
      // "Got it" will advance the lesson.
      onNarrate?.(pickEncouragementPhrase());
      onTakeover({
        question: predict.question,
        studentAnswer: predict.options[index],
        correctAnswer: predict.options[predict.correctOption],
        explanation: predict.explanation,
        hint: predict.hint,
      });
    } else if (willForceReveal) {
      // Defensive fallback when takeover isn't wired.
      setForceRevealed(true);
      setRevealed(true);
      onReveal?.({
        correct: false,
        body: `Answer: ${predict.options[predict.correctOption]}\n\n${predict.explanation}`,
      });
      onNarrate?.(pickEncouragementPhrase());
    } else if (predict.hint?.trim() && !showHint) {
      setShowHint(true);
      onHintPhase?.("hinted");
      onNarrate?.(predict.hint);
      onCaption?.(predict.hint);
    } else {
      // Non-final wrong AFTER the hint has already played (or there
      // was no hint to begin with). Play an encouragement phrase so
      // the student gets feedback instead of silence; don't replay
      // the same hint.
      onNarrate?.(pickEncouragementPhrase());
    }
  };

  // Auto-advance after reveal — pass actual correctness up.
  useEffect(() => {
    if (revealed && !answeredRef.current) {
      answeredRef.current = true;
      onAnswer(selected === predict.correctOption && !forceRevealed);
    }
  }, [revealed, selected, predict.correctOption, forceRevealed, onAnswer]);

  // Imperative handle for voice-driven selection.
  const handleSelectRef = useRef(handleSelect);
  handleSelectRef.current = handleSelect;
  useImperativeHandle(ref, () => ({
    selectByIndex: (i: number) => handleSelectRef.current(i),
  }), []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-3 relative"
    >
      <div className="text-lg font-medium text-foreground">
        <MathContent content={predict.question} size="lg" />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {predict.options.map((option, i) => {
          const isThis = selected === i;
          const isRight = i === predict.correctOption;
          const isWrong = wrongIndices.has(i);
          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={revealed || isWrong}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-lg transition-colors",
                !revealed && !isWrong && "hover:bg-muted cursor-pointer",
                revealed && isRight && "border-green-500 bg-green-500/10",
                revealed && isThis && !isRight && "border-red-500 bg-red-500/10",
                revealed && !isThis && !isRight && "opacity-50",
                isWrong && !revealed && "border-red-500/50 bg-red-500/5 opacity-60",
              )}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
                {revealed && isRight ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (revealed && isThis && !isRight) || isWrong ? (
                  <X className="h-3 w-3 text-red-500" />
                ) : (
                  String.fromCharCode(65 + i)
                )}
              </span>
              <span className="flex-1 text-left">
                <MathContent content={option} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Hint + revealed answer render in the canvas flow as callouts;
          predict cards just carry the question + choices. */}
    </motion.div>
  );
});

// ── Fill-blank question UI ──────────────────────────────────────────

const FillBlankCard = forwardRef<InteractionCardHandle, {
  fillBlank: FillBlankAction;
  onAnswer: (wasCorrect: boolean) => void;
  onNarrate?: (text: string) => void;
  onReveal?: (reveal: { correct: boolean; body: string }) => void;
  onTakeover?: (ctx: {
    question: string;
    studentAnswer: string;
    correctAnswer: string;
    explanation: string;
    hint?: string;
    detailedHint?: string;
  }) => void;
  onCaption?: (text: string) => void;
  onWrong?: () => void;
}>(function FillBlankCard({
  fillBlank,
  onAnswer,
  onNarrate,
  onReveal,
  onTakeover,
  onCaption,
  onWrong,
}, ref) {
  const [input, setInput] = useState("");
  const [attempts, setAttempts] = useState(0);
  // `isChecking` gates the submit while the algebraic equivalence
  // check is in flight (~50-200ms in prod). Both the Check button
  // and the Enter-key handler bail when true to prevent double-
  // submits.
  const [isChecking, setIsChecking] = useState(false);
  // answering → hinted (nudge) → detailed (walk-through) → revealed
  const [phase, setPhase] = useState<"answering" | "hinted" | "detailed" | "revealed">("answering");
  // Tracked separately so a force-reveal (attempts exhausted) doesn't
  // get reported as a correct answer — `setInput("")` already clears
  // the field on each wrong attempt, so deriving correctness from the
  // input state is unreliable on reveal.
  const [forceRevealed, setForceRevealed] = useState(false);
  const [lastWrong, setLastWrong] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const answeredRef = useRef(false);
  const sound = useSound();

  const isRevealed = phase === "revealed";

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Clear shake animation after short delay
  useEffect(() => {
    if (lastWrong) {
      const t = setTimeout(() => setLastWrong(false), 500);
      return () => clearTimeout(t);
    }
  }, [lastWrong]);

  // Auto-advance after reveal — pass real correctness up.
  useEffect(() => {
    if (isRevealed && !answeredRef.current) {
      answeredRef.current = true;
      onAnswer(!forceRevealed);
    }
  }, [isRevealed, forceRevealed, onAnswer]);

  // Imperative handle — voice dispatch populates the input field
  // when the student answers by voice.
  //
  // Auto-submit policy: if the populated text is INSTANTLY (sync)
  // equivalent to an accepted answer — case-insensitive string,
  // numeric, or `<var> = <value>` collapsed form — we run the check
  // immediately on the student's behalf. This avoids the regression
  // where saying just "3" for a fill_blank expecting 3 left the
  // student staring at a filled input. Ambiguous voice (anything
  // that wouldn't sync-match) still populates only — protects against
  // a misheard transcript force-triggering the 2nd-wrong takeover.
  useImperativeHandle(ref, () => ({
    setText: (text: string) => {
      if (isRevealed) return;
      setInput(text);
      const instantMatch = isEquivalentAnswer(text, fillBlank.acceptedAnswers);
      if (typeof window !== "undefined") {
        console.debug("[fill-blank] voice setText", {
          text,
          accepted: fillBlank.acceptedAnswers,
          instantMatch,
        });
      }
      if (instantMatch) {
        // Defer one frame so React commits the input state before
        // we trigger the check (also gives the input its focus tick
        // for accessibility/screenreaders that watch state changes).
        requestAnimationFrame(() => {
          // Pass the populated text directly — `input` state may not
          // yet reflect it inside this callback's closure.
          void checkAnswerRef.current(text);
        });
        return;
      }
      // Re-focus the field so the student can edit / press Enter.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        // Move caret to the end so they can append rather than
        // overwriting their voice input.
        const el = inputRef.current;
        if (el) {
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      });
    },
  }), [isRevealed, fillBlank.acceptedAnswers]);

  // Held in a ref so the imperative `setText` can call it without
  // capturing the closure's stale value of `input` / `isChecking`.
  const checkAnswerRef = useRef<(override?: string) => Promise<void>>(async () => {});

  const checkAnswer = async (override?: string) => {
    if (isChecking) return;
    const trimmed = (override ?? input).trim();
    if (!trimmed) return;

    // Match against acceptedAnswers via case-insensitive string
    // equality, then numeric equivalence (instant — covers "1/2" vs
    // "0.5", "2.50" vs "2.5", unicode-minus tolerance, etc.), then —
    // only on a sync miss — sympy via /api/agent/math-equiv for
    // algebraic forms ("2x+4" vs "4+2x", "2(x+2)" vs "2x+4",
    // factored / expanded equivalences, side-swapped equations). See
    // src/lib/answer-equivalence.ts.
    setIsChecking(true);
    let isCorrect = false;
    try {
      isCorrect = await isEquivalentAnswerAsync(
        trimmed,
        fillBlank.acceptedAnswers,
      );
    } finally {
      setIsChecking(false);
    }

    if (isCorrect) {
      sound.achievement();
      setPhase("revealed");
      onReveal?.({ correct: true, body: fillBlank.explanation });
      onNarrate?.(pickCorrectPhrase());
      return;
    }

    // Wrong answer. No negative SFX; the encouragement narration
    // carries the cue.
    onWrong?.();
    setLastWrong(true);
    setInput("");
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);

    const willForceReveal = newAttempts >= 2;

    if (willForceReveal && onTakeover) {
      // Final wrong — escalate to the tutor walkthrough overlay. "Got
      // it" will advance the lesson.
      onNarrate?.(pickEncouragementPhrase());
      onTakeover({
        // prompt is the canonical field, but the c2-ir serializer
        // shipped without the fill_blank remap for a stretch — so
        // production lessons stored before that fix only carry
        // `question`. Fall through to it so the takeover overlay has
        // the right text.
        question: fillBlank.prompt ?? fillBlank.question ?? "",
        studentAnswer: trimmed,
        correctAnswer: fillBlank.acceptedAnswers[0],
        explanation: fillBlank.explanation,
        hint: fillBlank.hint,
        detailedHint: fillBlank.detailedHint,
      });
    } else if (!willForceReveal) {
      // 1st wrong — surface the inline hint and let the student retry.
      setPhase("hinted");
      const hintText = fillBlank.hint?.trim();
      if (hintText) {
        onNarrate?.(hintText);
        onCaption?.(hintText);
      } else {
        onNarrate?.(pickEncouragementPhrase());
      }
    } else if (newAttempts >= 2) {
      // Defensive fallback when takeover isn't wired.
      setForceRevealed(true);
      setPhase("revealed");
      onReveal?.({
        correct: false,
        body: `Answer: ${fillBlank.acceptedAnswers[0]}\n\n${fillBlank.explanation}`,
      });
      onNarrate?.(pickEncouragementPhrase());
    }

    // Re-focus input for retry
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Keep the ref pointed at the latest closure so the imperative
  // `setText` voice-path can call it with the freshest `input` /
  // `isChecking` / `attempts` state.
  checkAnswerRef.current = checkAnswer;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-3"
    >
      <div className="text-lg font-medium text-foreground">
        {/* prompt is the wire-format field per FillBlankAction, but
            lessons generated before the c2-ir serializer remap landed
            only carry `question`. Read whichever is present so legacy
            stored lessons render their question above the input. */}
        <MathContent content={fillBlank.prompt ?? fillBlank.question ?? ""} size="lg" />
      </div>

      {!isRevealed && (
        <motion.div
          animate={lastWrong ? { x: [-4, 4, -4, 4, 0] } : {}}
          transition={{ duration: 0.3 }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isChecking) void checkAnswer();
            }}
            placeholder="Type your answer..."
            disabled={isChecking}
            className="flex-1 bg-muted/50 rounded-lg text-lg outline-none placeholder:text-muted-foreground py-2.5 px-3 border focus:border-athena-amber/50 transition-colors disabled:opacity-60"
          />
          <Button
            size="sm"
            onClick={() => void checkAnswer()}
            disabled={!input.trim() || isChecking}
          >
            {isChecking ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking
              </span>
            ) : (
              "Check"
            )}
          </Button>
        </motion.div>
      )}

      {/* Hint + detailed hint + revealed answer render in the canvas flow
          as callouts; this card just carries the prompt + input. */}
    </motion.div>
  );
});

// ── Pulse-check question UI ─────────────────────────────────────────
//
// A soft, caring mid-TEACH probe. EXACTLY 2 options. Different from
// CheckInCard / PredictCard in three ways:
//
//   1. No "wrong" red state. The trap option doesn't read as failure.
//      Both options get a callout-style explanation on click.
//   2. No retry, no progressive hint, no tutor takeover. A single
//      click resolves the moment.
//   3. The "correct" / "trap" distinction lives in tone, not pass/fail
//      framing. The trap-explanation validates the instinct ("this is
//      where most people slip"), then redirects.
//
// Like the other interaction cards, this resolves to handleInteractionAnswer
// which gates the next-step advance on narration completion.

const PulseCheckCard = forwardRef<InteractionCardHandle, {
  pulseCheck: PulseCheckAction;
  onAnswer: (wasCorrect: boolean) => void;
  onNarrate?: (text: string) => void;
  onReveal?: (reveal: { correct: boolean; body: string }) => void;
  onCaption?: (text: string) => void;
}>(function PulseCheckCard({
  pulseCheck,
  onAnswer,
  onNarrate,
  onReveal,
  onCaption,
}, ref) {
  const [selected, setSelected] = useState<number | null>(null);
  const answeredRef = useRef(false);
  const sound = useSound();

  const isRevealed = selected !== null;
  const isCorrect = selected === pulseCheck.correctOption;

  const handleSelect = useCallback((index: number) => {
    if (selected !== null) return;
    setSelected(index);
    const correct = index === pulseCheck.correctOption;
    const body = correct ? pulseCheck.explanation : pulseCheck.trapExplanation;
    // Soft chime for either pick — the moment is reflective, not
    // pass/fail. The achievement SFX would over-celebrate a low-stakes
    // probe, and the error SFX would shame the (often instructive)
    // trap pick. Achievement only when they spotted the subtlety.
    if (correct) sound.achievement();
    onReveal?.({ correct, body });
    onCaption?.(body);
    onNarrate?.(body);
  }, [selected, pulseCheck, sound, onReveal, onCaption, onNarrate]);

  // Auto-advance after a pick — pass actual correctness up. Same flow
  // as PredictCard/CheckInCard so handleInteractionAnswer's
  // narration-wait gate works.
  useEffect(() => {
    if (isRevealed && !answeredRef.current) {
      answeredRef.current = true;
      onAnswer(isCorrect);
    }
  }, [isRevealed, isCorrect, onAnswer]);

  const handleSelectRef = useRef(handleSelect);
  handleSelectRef.current = handleSelect;
  useImperativeHandle(ref, () => ({
    selectByIndex: (i: number) => handleSelectRef.current(i),
  }), []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-3 relative"
    >
      <div className="text-lg font-medium text-foreground">
        <MathContent content={pulseCheck.question} size="lg" />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {pulseCheck.options.map((option, i) => {
          const isThis = selected === i;
          const isRight = i === pulseCheck.correctOption;
          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={isRevealed}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-lg transition-colors",
                !isRevealed && "hover:bg-muted cursor-pointer",
                // After reveal: the picked option gets a soft amber halo
                // (not red/green). Both correct + trap surface their
                // explanation; the framing is reflective, not graded.
                isRevealed && isThis && isRight && "border-green-500/60 bg-green-500/5",
                isRevealed && isThis && !isRight && "border-athena-amber/60 bg-athena-amber/5",
                isRevealed && !isThis && "opacity-50",
              )}
              style={
                isRevealed && isThis && isRight
                  ? { boxShadow: "0 0 10px rgba(34, 197, 94, 0.25)" }
                  : isRevealed && isThis && !isRight
                    ? { boxShadow: "0 0 10px rgba(251, 191, 36, 0.25)" }
                    : undefined
              }
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-xs font-medium">
                {isRevealed && isThis && isRight ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : isRevealed && isThis && !isRight ? (
                  // Trap pick: a sparkle, NOT an X. The visual tone
                  // matches "interesting moment" rather than "wrong".
                  <Sparkles className="h-3 w-3 text-athena-amber" />
                ) : (
                  String.fromCharCode(65 + i)
                )}
              </span>
              <span className="flex-1 text-left">
                <MathContent content={option} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Explanation (correct or trap) renders as a canvas-flow callout
          via onReveal — same surface as the other interaction cards'
          reveal callouts, so visual treatment stays consistent. */}
    </motion.div>
  );
});

// ── Main component ────────────────────────────────────────────────────

// Push-to-talk voice input mode is hidden for the demo: its mic icon
// duplicates the always-listening mic toggle in the transport row, and
// the hold-to-talk flow isn't part of the demo. Flip to `true` to
// restore the text/voice mode switch on the chat input.
const SHOW_VOICE_INPUT_MODE = false;

export function MicroLesson({
  topic,
  subtopic,
  metadata,
  onClose,
  practiceProblems: providedPracticeProblems,
  streamUrl,
  chatStreamUrl,
  existingLesson,
  subtopicApiPath,
  practiceMode,
  tracking,
  freezeCanvas = false,
  debugScrub = false,
  skipPractice = false,
  noirCanvas = false,
  corkboardCanvas = false,
  debugOrb = false,
  wrapUpVideoUrl,
  wrapUpNarration,
  introVideoUrl,
  ambientMusicUrl,
}: MicroLessonProps) {
  const Canvas = corkboardCanvas
    ? WhiteboardCanvasCorkboard
    : noirCanvas
      ? WhiteboardCanvasNoir
      : WhiteboardCanvas;
  // Portrait phones get the stacked card renderer instead of the wide SVG
  // board. Inert on desktop (and on real phones until the viewport meta tag
  // lands in A2 — without it innerWidth reports ~980 and this stays "desktop").
  const isMobilePortrait = useLessonViewport() === "mobile-portrait";
  const {
    phase,
    lessonContent,
    whiteboardSteps,
    isWhiteboardStreaming,
    generateLesson,
    updateTracking,
    getSessionId,
  } = useMicroLesson({ topic, subtopic, metadata, streamUrl, chatStreamUrl, existingLesson, subtopicApiPath, tracking });

  const specializedPractice = useSpecializedPractice();

  const {
    state: playerState,
    userStepIndex,
    currentStepIndex,
    stepProgress,
    visibleStepIds,
    isLastStep,
    isCheckIn,
    currentCheckIn,
    isInteraction,
    currentPrediction,
    currentFillBlank,
    currentPulseCheck,
    advance,
    seekTo,
    replayCurrent,
    totalSteps,
  } = useStepPlayer(whiteboardSteps, isWhiteboardStreaming, {
    // Slow diagram reveals while the roaming orb is on so it can visibly
    // "draw" each shape instead of them snapping in. Auto-advance waits for
    // the draw to finish (playerState "waiting"), so a slow draw is never cut.
    diagramDurationScale: debugOrb ? 2.5 : 1,
  });
  // True iff onSpeechRealStart canceled an in-flight narration. The
  // voice-dispatch path consults this on "drop" early-returns to
  // decide whether to re-narrate. Set in onSpeechRealStart, consumed
  // and cleared by dispatchVoiceUtterance / submitChatText.
  const speechCanceledNarrationRef = useRef(false);
  // Replay-the-current-step's-narration callback. Used to resume
  // lesson narration after onSpeechRealStart preemptively cancels it
  // but the resulting transcript gets dropped (ambient noise, empty,
  // chat-busy). We can't go through the lesson player's
  // `replayCurrent` for this — the narration effect has a
  // `lastNarratedStepRef === userStepIndex` dedup guard that bails on
  // same-step "replay", so calling replayCurrent alone re-renders the
  // step without re-firing narration. Solution: invoke playNarration
  // directly with the current step's text. Wired below once
  // playNarration + whiteboardSteps + userStepIndex are all in scope.
  const replayCurrentNarrationRef = useRef<(() => void) | null>(null);

  // Pause flag for the debug scrubber. Halts auto-advance and pauses
  // TTS audio playback so a step can be inspected indefinitely.
  const [paused, setPaused] = useState(false);

  // ── Practice phase state ─────────────────────────────────────────────

  type LessonPhase = "intro" | "lesson" | "wrap-up" | "practice" | "complete";
  const [lessonPhase, setLessonPhase] = useState<LessonPhase>(
    introVideoUrl ? "intro" : "lesson",
  );
  // True while the intro video is on screen. The step player auto-starts
  // step 0 internally (useStepPlayer) the moment generation streams steps
  // in, so the narration + auto-advance effects below consult this ref to
  // stay quiet until the intro finishes. handleIntroFinished narrates the
  // current step directly on exit (the narration effect won't re-fire on a
  // phase change — its deps are [userStepIndex, playNarration]).
  const introActiveRef = useRef(lessonPhase === "intro");
  introActiveRef.current = lessonPhase === "intro";
  const [fetchedPracticeProblems, setFetchedPracticeProblems] = useState<Problem[]>([]);
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
  const [practiceCorrectCount, setPracticeCorrectCount] = useState(0);
  // Monotonic answer nonces — bump on every correct/wrong submission
  // (in-lesson check-in/predict/fill-blank + practice). The dog-progress
  // hook watches these and flashes "jumping" / "failed" on each increment.
  const [correctNonce, setCorrectNonce] = useState(0);
  const [wrongNonce, setWrongNonce] = useState(0);
  const [isPracticeLoading, setIsPracticeLoading] = useState(false);
  const [practiceHintPhase, setPracticeHintPhase] = useState<"answering" | "hinted" | "detailed" | "revealed">("answering");
  // Drives the canvas-overlay "Correct!" pulse. Set when the student
  // answers correctly; cleared on the next problem so feedback doesn't
  // bleed across questions. Lives at this level so the overlay can
  // render on the whiteboard canvas region (where attention is) rather
  // than inside the bottom interaction pane.
  const [revealedCorrect, setRevealedCorrect] = useState(false);
  const prefetchedRef = useRef(false);

  // ── Practice back/forward navigation state ──
  // Maps problem INDEX (not id) to the saved pane state. Index-keying
  // is the right choice because navigation is positional — going Prev
  // from index 3 lands at index 2 regardless of how the problem
  // sequence was generated. Stored as a ref because the parent doesn't
  // re-render on history mutation; only currentProblemIndex changing
  // re-renders, and that re-renders correctly because the lookup is
  // `history.get(currentProblemIndex)` and currentProblemIndex IS the
  // re-render trigger.
  const practiceHistoryRef = useRef<Map<number, PracticePaneSavedState>>(
    new Map(),
  );
  // Mirror of the pane's latest internal state — updated via
  // onStateChange so a Prev/Next click can stash the current state
  // BEFORE swapping the problem out from under the pane.
  const latestPaneStateRef = useRef<PracticePaneSavedState | null>(null);
  // Highest problem index the student has reached. Bounds the
  // "Next" affordance: they can only navigate forward to problems
  // they've already seen.
  const maxVisitedIndexRef = useRef(0);
  // Stable read of currentProblemIndex inside the useCallback'd
  // navigation handlers — useCallback's [] dep keeps handler
  // identity stable for the auto-advance effect, so we use a ref
  // instead of putting currentProblemIndex in the deps.
  const currentProblemIndexRef = useRef(currentProblemIndex);
  currentProblemIndexRef.current = currentProblemIndex;
  // Practice-problem indices the student struggled on — any problem with at
  // least one wrong attempt, or that they exhausted without solving. Read
  // only at the lesson-complete handoff (no re-render needed) to forward the
  // missed questions' text into the specialized-practice classifier, matching
  // the targeting the quiz path already gets.
  const struggledPracticeIndicesRef = useRef<Set<number>>(new Set());

  // Reset the practice hint phase when the active practice problem
  // changes so callouts don't carry across questions.
  useEffect(() => {
    setPracticeHintPhase("answering");
    setRevealedCorrect(false);
  }, [currentProblemIndex]);

  const activePracticeProblems = providedPracticeProblems ?? fetchedPracticeProblems;
  const currentPracticeProblem = activePracticeProblems[currentProblemIndex] ?? null;

  const fetchPracticeProblems = useCallback(async () => {
    if (providedPracticeProblems) return;
    setIsPracticeLoading(true);
    try {
      const res = await fetch("/api/agent/practice-problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          subtopic,
          subject: practiceMode?.subject ?? "math",
        }),
      });
      if (!res.ok) throw new Error("Failed to load practice problems");
      const data = await res.json();
      setFetchedPracticeProblems((data.problems as Problem[]).slice(0, 2));
    } catch {
      toast.error("Could not load practice problems");
      setLessonPhase("complete");
    } finally {
      setIsPracticeLoading(false);
    }
  }, [topic, subtopic, practiceMode?.subject, providedPracticeProblems]);

  // Pre-fetch problems near end of lesson
  useEffect(() => {
    if (
      skipPractice ||
      prefetchedRef.current ||
      providedPracticeProblems ||
      whiteboardSteps.length === 0 ||
      userStepIndex < whiteboardSteps.length - 3
    ) return;
    prefetchedRef.current = true;
    fetchPracticeProblems();
  }, [userStepIndex, whiteboardSteps.length, fetchPracticeProblems, providedPracticeProblems, skipPractice]);

  // ── Chat state ───────────────────────────────────────────────────────

  const [isChatting, setIsChatting] = useState(false);
  // The Extra Help panel element — the roaming orb (?debug=orb) docks to it
  // during a tutor takeover / free chat.
  const chatPanelRef = useRef<HTMLDivElement>(null);
  // Latest pen-tip (client px) published by the lesson canvas while a diagram
  // step draws. Written from a stable callback so per-frame updates never
  // re-render; the presence layer reads it in its own animation loop.
  const penClientRef = useRef<{ x: number; y: number } | null>(null);
  const handlePenTip = useCallback((p: { x: number; y: number } | null) => {
    penClientRef.current = p;
  }, []);
  // Current step location, so the resting orb can hover beside the latest
  // content (and switch sides) rather than parking in the corner.
  const stepFocusRef = useRef<StepFocus | null>(null);
  const handleStepFocus = useCallback((f: StepFocus | null) => {
    stepFocusRef.current = f;
  }, []);
  // Orb spotlight — the part of a drawn shape the current step discusses.
  const spotlightRef = useRef<OrbSpotlight | null>(null);
  const handleSpotlight = useCallback((s: OrbSpotlight | null) => {
    spotlightRef.current = s;
  }, []);
  // Side-quest collapse: when the chat ("I don't get it") takeover
  // appends tutor steps onto the lesson canvas, the student can fold
  // those steps out of view to refocus on the lesson, then expand them
  // again. Reset to expanded whenever a new chat session starts so the
  // tutor's response is visible by default; only hide chat IDs from
  // canvasVisibleIds when collapsed (chat steps stay in canvasSteps so
  // re-expanding doesn't require a re-stream).
  const [chatCollapsed, setChatCollapsed] = useState(false);
  useEffect(() => {
    if (isChatting) setChatCollapsed(false);
  }, [isChatting]);
  // Flying-answer transition. When the student sends a chat message
  // (typed, voice, or handwritten), the text lifts off the input line
  // and streams up into the Extra Help panel, so the message reads as
  // "going into" the tutor conversation. Reserved for genuine student
  // input — the auto-fired 2nd-wrong takeover does NOT animate, since
  // its seed prompt is Athena-generated, not typed by the student.
  // `runId` retriggers the animation for each successive send.
  const [flyingAnswer, setFlyingAnswer] = useState<{
    text: string;
    runId: number;
  } | null>(null);
  const flyingRunIdRef = useRef(0);
  const triggerFlyingAnswer = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    flyingRunIdRef.current += 1;
    setFlyingAnswer({ text: t, runId: flyingRunIdRef.current });
  }, []);
  // Clear once the glyphs have landed so the overlay doesn't linger.
  useEffect(() => {
    if (!flyingAnswer) return;
    const timer = setTimeout(() => setFlyingAnswer(null), 1700);
    return () => clearTimeout(timer);
  }, [flyingAnswer]);
  const [chatInput, setChatInput] = useState("");
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Pending image attachment captured via the paperclip launcher.
  // Held across the chat turn — included in `chat.sendChat(text, { image })`
  // and cleared after submit. The agent receives the image as a
  // multimodal turn (Claude vision) through `useLessonChat`'s `lesson`
  // variant body extension.
  const [pendingImage, setPendingImage] = useState<Blob | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  // In-canvas "Draw on the board" overlay toggle. Replaces the old
  // pencil dialog: an ink layer drops over the board, the student
  // handwrites, and the recognized LaTeX auto-sends to the tutor.
  const [drawingInline, setDrawingInline] = useState(false);
  useEffect(() => {
    if (!pendingImage) {
      setPendingPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingImage);
    setPendingPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingImage]);
  // Ref mirror so the voice STT dispatcher (which captures
  // submitChatText with empty deps) sees the latest value.
  const pendingImageRef = useRef<Blob | null>(null);
  pendingImageRef.current = pendingImage;

  const chat = useLessonChat({
    topic,
    subtopic,
    lessonContent,
    metadata,
    whiteboardSteps,
    currentStepIndex: userStepIndex,
    chatStreamUrl,
    currentPracticeProblem: lessonPhase === "practice" ? currentPracticeProblem : null,
  });

  // Chat steps the canvas should render. The chat agent's prose
  // explanations come through as `write_text` steps; those used to be
  // dropped here (treated as TTS-only filler) which left the canvas
  // empty when the tutor leaned conversational — exactly the "I don't
  // see the conversation on the canvas" case. Now we include them so
  // the tutor's explanation lands on the canvas as readable text,
  // alongside any `write_math` / `callout` / visual steps the agent
  // emits.
  const chatRenderSteps = chat.chatWhiteboardSteps;

  // Build visible IDs for chat whiteboard — progressive reveal synced
  // with narration. Iterate the FULL step list (so clear/erase semantics
  // apply against every step's id), then intersect with the rendered
  // set so filtered steps never appear in the visible mask.
  const chatVisibleIds = useMemo(() => {
    const ids = new Set<number>();
    const upTo = Math.min(
      Math.max(chat.chatNarrationIndex, 0),
      chat.chatWhiteboardSteps.length - 1,
    );
    for (let i = 0; i <= upTo; i++) {
      const step = chat.chatWhiteboardSteps[i];
      if (step.action.type === "clear") {
        ids.clear();
      } else if (step.action.type === "erase" && step.action.targetStepIndices) {
        for (const idx of step.action.targetStepIndices) {
          const target = chat.chatWhiteboardSteps[idx];
          if (target) ids.delete(target.id);
        }
      }
      ids.add(step.id);
    }
    const renderableIds = new Set(chatRenderSteps.map((s) => s.id));
    return new Set([...ids].filter((id) => renderableIds.has(id)));
  }, [chat.chatWhiteboardSteps, chat.chatNarrationIndex, chatRenderSteps]);

  // Track which hint tier the student is on (for canvas visual updates)
  const [interactionHintPhase, setInteractionHintPhase] = useState<"none" | "hinted" | "detailed">("none");
  // Ad-hoc caption surfaced under the orb — currently set when an
  // interaction card emits an inline hint after a non-final wrong
  // answer. Hints used to render as canvas callouts; they now play
  // via TTS and display under the orb. Cleared when the step advances
  // (wrappedAdvance) or the user seeks to a different step.
  const [transientCaption, setTransientCaption] = useState<string | null>(null);
  // "Narration about to play" indicator that shows once on first lesson
  // start. Feedback called out that students didn't realize lessons
  // are narrated — a transient pill at the top of the canvas removes
  // the surprise. Auto-dismisses after 4s; only shows the very first
  // time on this lesson instance.
  const [showAudioIndicator, setShowAudioIndicator] = useState(false);
  const audioIndicatorFiredRef = useRef(false);
  useEffect(() => {
    setTransientCaption(null);
  }, [userStepIndex]);
  // Set by interaction cards (check_in / predict / fill_blank) when the
  // answer reveals — surfaces a canvas callout with the correct answer +
  // explanation instead of an in-card block. Cleared on advance.
  const [interactionAnswerReveal, setInteractionAnswerReveal] = useState<{ correct: boolean; body: string } | null>(null);
  // Bumped to tell the whiteboard canvas to re-arm "follow latest" and
  // pin to the resuming step. Driven by interaction resumes (wrappedAdvance)
  // and the transport ◀/▶ buttons — moments where the student clearly wants
  // the latest content even if a prior scroll-up latched following off.
  const [resumeFollowNonce, setResumeFollowNonce] = useState(0);
  // Set when an interaction wrong-answer escalates to a tutor takeover.
  // Drives a hidden seed prompt into the chat agent + replaces the
  // page-footer chat input with action buttons (Explain more / Got it).
  //   mode "hint": 1st wrong — gentle nudge; "Got it" closes the
  //     takeover and lets the student RETRY the question.
  //   mode "walkthrough": 2nd wrong (or force-reveal) — full
  //     explanation; "Got it" advances the lesson, marking the
  //     interaction as not-correct.
  // TODO: when we add a third interaction-outcome signal beyond
  // correct/not-correct (e.g. "agent-instruction" — answered after the
  // tutor explained), thread that through here so the metric distinguishes
  // a takeover-resolved interaction from a plain force-reveal.
  type TakeoverContext = {
    question: string;
    studentAnswer: string;
    correctAnswer: string;
    explanation: string;
    hint?: string;
    detailedHint?: string;
  };
  const [interactionTakeover, setInteractionTakeover] = useState<TakeoverContext | null>(null);

  // ── Tracking: push step/checkin counts to session tracking ────────
  const checkinsCorrectRef = useRef(0);
  const checkinsTotalRef = useRef(0);
  // Whether the most recent interaction was answered correctly by the
  // student vs auto-revealed after exhausting tries. Used by both the
  // tracking metric (only count real-correct check-ins) and the
  // narration choice (encouragement vs congrats phrase).
  const lastInteractionWasCorrectRef = useRef(true);

  useEffect(() => {
    updateTracking({ stepsViewed: Math.max(0, userStepIndex + 1) });
  }, [userStepIndex, updateTracking]);

  // Reset hint phase when advancing to a new step
  const wrappedAdvance = useCallback(() => {
    // If advancing past a check-in, count it. Only bump
    // checkinsCorrect when the student actually got it right —
    // force-reveal advances should NOT inflate the metric.
    const step = whiteboardSteps[userStepIndex];
    if (step && step.action.type === "check_in") {
      checkinsTotalRef.current++;
      if (lastInteractionWasCorrectRef.current) {
        checkinsCorrectRef.current++;
      }
      updateTracking({
        checkinsCorrect: checkinsCorrectRef.current,
        checkinsTotal: checkinsTotalRef.current,
      });
    }
    setInteractionHintPhase("none");
    setInteractionAnswerReveal(null);
    setInteractionTakeover(null);
    setTransientCaption(null);
    // Re-arm canvas follow so the resuming step is revealed even if the
    // student scrolled up to read the interaction (or the question panel
    // shrank the viewport and latched following off).
    setResumeFollowNonce((n) => n + 1);
    advance();
  }, [advance, whiteboardSteps, userStepIndex, updateTracking]);

  // Build synthetic step for interaction visual (shown on canvas during
  // check-in/predict/fill_blank/pulse_check). Selects the appropriate
  // visual based on hint phase with fallback chain. pulse_check has no
  // hint/detailedHint visuals (no progressive scaffolding) — only the
  // single optional `visual` field.
  const activeInteractionVisual = useMemo(() => {
    const action = currentCheckIn ?? currentPrediction ?? currentFillBlank ?? currentPulseCheck ?? null;
    if (!action) return null;

    if (interactionHintPhase === "detailed" && "detailedHintVisual" in action) {
      return action.detailedHintVisual ?? ("hintVisual" in action ? action.hintVisual : null) ?? action.visual ?? null;
    }
    if (interactionHintPhase === "hinted" && "hintVisual" in action) {
      return action.hintVisual ?? action.visual ?? null;
    }
    return action.visual ?? null;
  }, [currentCheckIn, currentPrediction, currentFillBlank, currentPulseCheck, interactionHintPhase]);

  const interactionVisualStep = useMemo(() => {
    // ?debug=freeze: keep the accumulated canvas on screen without the
    // appended hint visual. Useful for screenshots; never ships to real
    // users.
    if (freezeCanvas) return null;
    if (!isInteraction || !activeInteractionVisual) return null;
    return { id: -1, delayMs: 0, durationMs: 0, action: activeInteractionVisual } as WhiteboardStep;
  }, [freezeCanvas, isInteraction, activeInteractionVisual]);

  // In-lesson hints no longer render to the canvas — they play via TTS
  // and surface as the orb caption (see `transientCaption`). Kept as
  // an empty array so the step-counting / id-collection plumbing
  // downstream stays a no-op without further conditionals. Practice
  // problems still render their hints to the canvas via
  // `practiceHintCalloutSteps`.
  const hintCalloutSteps = useMemo<WhiteboardStep[]>(() => [], []);

  // Answer-reveal callout: surfaces the correct answer + explanation on
  // canvas when an interaction card (check_in / predict / fill_blank)
  // reveals — replaces the in-card "Answer: X" block. Sentinel id is
  // distinct from hint callouts so it co-exists with them on a
  // force-reveal where hints + answer are both visible.
  const ANSWER_CALLOUT_STEP_ID = -6;
  const answerCalloutSteps = useMemo<WhiteboardStep[]>(() => {
    // Tutor takeover replaces the answer reveal — suppress the callout
    // so the takeover overlay carries the explanation alone.
    if (interactionTakeover) return [];
    if (!interactionAnswerReveal) return [];
    return [
      {
        id: ANSWER_CALLOUT_STEP_ID,
        delayMs: 0,
        durationMs: 600,
        action: {
          type: "callout",
          variant: interactionAnswerReveal.correct
            ? "answer-correct"
            : "answer-incorrect",
          body: interactionAnswerReveal.body,
        },
      } as WhiteboardStep,
    ];
  }, [interactionAnswerReveal, interactionTakeover]);

  // Practice-phase analog: when the student gets a practice problem
  // wrong, surface the problem's `hint` and (later) `detailedHint` as
  // canvas callouts on the right pane. Mirrors the check-in flow so
  // practice and lesson interactions feel consistent. Sentinel ids
  // are distinct from the interaction callouts so both sets can
  // co-exist (they don't in practice, but the negative-id space stays
  // disjoint).
  // Practice hints used to render as canvas callouts; they now play via
  // TTS and display under the orb as the transient caption (parallel to
  // the in-lesson interaction hint flow). Kept as an empty array so the
  // step-counting / id-collection plumbing downstream stays a no-op.
  const practiceHintCalloutSteps = useMemo<WhiteboardStep[]>(() => [], []);

  // ── Narration state ──────────────────────────────────────────────────

  const [isNarrating, setIsNarrating] = useState(false);
  const [isTtsLoading, setIsTtsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Narration playback speed multiplier. Driven by the keyboard-arrow
  // playback keypad below the lesson canvas; applied to both the
  // ElevenLabs <Audio> (audio.playbackRate) and the browser
  // SpeechSynthesis fallback (utt.rate). A ref mirrors the state so
  // the playNarration closure (created once via useCallback) reads
  // the latest value without re-binding on every state change.
  const [narrationRate, setNarrationRate] = useState(1);
  const narrationRateRef = useRef(narrationRate);
  narrationRateRef.current = narrationRate;
  // Volume + mute state. Effective volume passed to audio.volume is
  // `narrationMuted ? 0 : narrationVolume`. The ref pair mirrors state
  // so the playNarration closure (memoized via useCallback) reads the
  // latest values without re-binding. SpeechSynthesis has no volume
  // analogue we can rely on cross-platform, so the mute / volume only
  // governs the ElevenLabs <Audio> path; the SpeechSynthesis fallback
  // honors mute by setting utt.volume = 0.
  const [narrationVolume, setNarrationVolume] = useState(1);
  const [narrationMuted, setNarrationMuted] = useState(false);
  const narrationVolumeRef = useRef(narrationVolume);
  narrationVolumeRef.current = narrationVolume;
  const narrationMutedRef = useRef(narrationMuted);
  narrationMutedRef.current = narrationMuted;
  // Apply rate changes to the currently-playing audio so the speed
  // control takes effect mid-sentence rather than only on the next
  // narration boundary.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = narrationRate;
    }
  }, [narrationRate]);
  // Same for volume / mute — propagate to in-flight audio.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = narrationMuted ? 0 : narrationVolume;
    }
  }, [narrationVolume, narrationMuted]);

  // ── Ambient background music ─────────────────────────────────────────
  // A low-volume looping track that underscores the lesson. Sits well
  // below the TTS narration so it doesn't compete with it. Plays from the
  // lesson phase onward (not during the intro video, which carries its own
  // audio). Toggleable via the music button in the bottom controls.
  const AMBIENT_MUSIC_VOLUME = 0.12;
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const [musicOn, setMusicOn] = useState(true);
  // Start (or stop) the ambient loop. Driven by musicOn + whether we've
  // left the intro. Browsers may reject autoplay-with-sound without a
  // recent user gesture; if play() rejects we arm a one-shot
  // pointer/keydown listener that retries on the next interaction.
  useEffect(() => {
    const audio = musicAudioRef.current;
    if (!audio) return;
    audio.volume = AMBIENT_MUSIC_VOLUME;
    const shouldPlay = musicOn && lessonPhase !== "intro";
    if (!shouldPlay) {
      audio.pause();
      return;
    }
    let cleanup: (() => void) | undefined;
    const tryPlay = () => audio.play().catch(() => false);
    tryPlay().then((res) => {
      if (res === false && !cleanup) {
        const resume = () => {
          audio.play().catch(() => {});
          window.removeEventListener("pointerdown", resume);
          window.removeEventListener("keydown", resume);
        };
        window.addEventListener("pointerdown", resume, { once: true });
        window.addEventListener("keydown", resume, { once: true });
        cleanup = () => {
          window.removeEventListener("pointerdown", resume);
          window.removeEventListener("keydown", resume);
        };
      }
    });
    return () => cleanup?.();
  }, [musicOn, lessonPhase]);
  // Cancel handle for the most recent in-flight playNarration call.
  // A new call invokes this to flip the previous call's `cancelled`
  // flag, so a previous fetch that hasn't yet attached an Audio
  // element doesn't complete and start playing alongside the newer
  // narration. Pure audioRef pausing isn't enough because the
  // previous Audio doesn't exist yet during the in-flight window.
  const cancelLatestNarrationRef = useRef<(() => void) | null>(null);
  // Pause / resume — soft-stop variants of cancel. Used by the
  // always-listening voice path: speech-start PAUSES (preserves
  // playback position + the Audio element), then either the dropped-
  // ambient handler RESUMES from the same spot, or a real utterance
  // (option select / fill-blank / chat) explicitly calls
  // cancelLatestNarrationRef to fully discard. The previous behavior
  // hard-canceled on speech-start and replayed the step from frame 0
  // on ambient — every cough/keyboard click restarted the lesson.
  const pauseLatestNarrationRef = useRef<(() => void) | null>(null);
  const resumeLatestNarrationRef = useRef<(() => boolean) | null>(null);
  // Set true when pauseLatestNarrationRef has paused something that
  // hasn't yet been resumed or canceled. Cleared on both resume + on
  // any subsequent cancel so the flag tracks a single pause cycle.
  const narrationPausedByAmbientRef = useRef(false);
  const advanceRef = useRef(wrappedAdvance);
  advanceRef.current = wrappedAdvance;
  const isChattingRef = useRef(isChatting);
  isChattingRef.current = isChatting;
  // Guards the narration effect against React strict mode's double-fire in
  // dev: the effect cleanup would otherwise cancel an in-flight TTS fetch
  // that the second mount then kicks off again, producing the "audio turns
  // off then on" pattern with a clipped first letter.
  const lastNarratedStepRef = useRef<number>(-1);

  // Start lesson generation on mount
  useEffect(() => {
    generateLesson();
  }, [generateLesson]);

  // Pause / resume TTS audio when the scrubber's paused flag toggles.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (paused) audio.pause();
    else audio.play().catch(() => { /* autoplay can fail; ignore */ });
  }, [paused]);

  // ── Pause lesson when chat opens ─────────────────────────────────────

  useEffect(() => {
    if (isChatting) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setIsNarrating(false);
      setIsTtsLoading(false);
    }
  }, [isChatting]);

  useEffect(() => {
    if (chat.ttsFailed) {
      toast.error("Couldn't play audio for that response.", { duration: 3000 });
    }
  }, [chat.ttsFailed]);

  const closeChat = useCallback(() => {
    setIsChatting(false);
    chat.clearChat();
    // Re-sync the lesson player to the current step. While chat was
    // open the rAF kept ticking but the auto-advance was gated on
    // !isChatting, so the player state could end up out of sync with
    // the visible step (e.g., we reached a check_in but state never
    // reflected it because the narration effect was bailed by
    // isChattingRef). Replaying the current step calls startStep,
    // which sets state correctly per the step's action type
    // (check_in → "check_in", predict/fill_blank/pulse_check →
    // "awaiting_input", teaching → "animating"). Resetting the narration dedup ref
    // lets the narration effect re-fire so the student is
    // re-introduced to where they are.
    lastNarratedStepRef.current = -1;
    replayCurrent();
  }, [chat, replayCurrent]);

  // ── TTS narration ──────────────────────────────────────────────────
  // Teaching steps: narrate on arrival (while visual animates)
  // Predict/fill_blank: narrate AFTER student answers (called via playNarration)
  // Check-in: narrate question on arrival

  const playNarration = useCallback((text: string, opts?: { onEnded?: () => void }) => {
    // Optional completion callback, fired at most once. Used by the
    // wrap-up pacer to advance to the next beat only when this beat's
    // narration has finished (in the chosen voice). Fires on natural
    // end / error / "nothing to play" (webdriver, empty text); NOT on an
    // explicit cancel — a cancelled beat must not auto-advance.
    let endedFired = false;
    const fireEnded = () => {
      if (endedFired) return;
      endedFired = true;
      opts?.onEnded?.();
    };
    // First-narration audio indicator: show a transient "Athena will
    // narrate this lesson" pill on the very first playNarration call
    // of the session. Auto-dismisses after 4s. Surfaces audio mode
    // for students who'd otherwise miss it (the feedback was that
    // students didn't realize lessons are narrated).
    if (!audioIndicatorFiredRef.current) {
      audioIndicatorFiredRef.current = true;
      setShowAudioIndicator(true);
      setTimeout(() => setShowAudioIndicator(false), 4000);
    }
    // Cancel any in-flight previous call (its fetch may not have
    // returned yet, in which case audioRef.current is still null and
    // pausing it is a no-op — but the Audio element is about to be
    // created and start playing). Flipping the previous call's
    // `cancelled` flag bails it out before the audio ever starts.
    cancelLatestNarrationRef.current?.();
    cancelLatestNarrationRef.current = null;
    pauseLatestNarrationRef.current = null;
    resumeLatestNarrationRef.current = null;
    narrationPausedByAmbientRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    // Suppress the live ElevenLabs call under automated browsers
    // (Playwright sets navigator.webdriver) so visual / replay tests
    // don't burn through the TTS quota on every run. Real users get
    // ElevenLabs primarily, with a browser SpeechSynthesis fallback
    // when ElevenLabs is unavailable (see speakViaBrowserFallback).
    if (typeof navigator !== "undefined" && navigator.webdriver) {
      // Automated browser: narration is suppressed (see comment above).
      // Treat as instantly finished so the wrap-up pacer doesn't deadlock
      // under Playwright — it then advances on the video boundary alone.
      fireEnded();
      return;
    }
    if (isChattingRef.current || !text) {
      fireEnded();
      return;
    }

    setIsTtsLoading(true);
    let cancelled = false;
    cancelLatestNarrationRef.current = () => {
      cancelled = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      narrationPausedByAmbientRef.current = false;
      // Also stop any in-flight browser SpeechSynthesis (no-op if none).
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
    pauseLatestNarrationRef.current = () => {
      // Pause whatever's playing — Audio object OR browser TTS — but
      // keep both alive so resume can pick up where they left off. No
      // -op if nothing is currently playing yet (e.g. the TTS request
      // is still in flight and the Audio element hasn't been created).
      // In that case the loading path falls through and the audio
      // will play normally once it lands; if the student's utterance
      // turns out to be real, cancelLatestNarrationRef gets called
      // later by the dispatch path and we still discard cleanly.
      let didPause = false;
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        didPause = true;
      }
      if (
        typeof window !== "undefined" &&
        "speechSynthesis" in window &&
        window.speechSynthesis.speaking &&
        !window.speechSynthesis.paused
      ) {
        try {
          window.speechSynthesis.pause();
          didPause = true;
        } catch {
          // Some engines no-op or throw on pause — fine, we just
          // don't get the resume optimization for that path.
        }
      }
      if (didPause) {
        narrationPausedByAmbientRef.current = true;
        if (typeof window !== "undefined") {
          console.debug("[narration] paused for voice activity");
        }
      }
    };
    resumeLatestNarrationRef.current = () => {
      if (!narrationPausedByAmbientRef.current) return false;
      narrationPausedByAmbientRef.current = false;
      let resumed = false;
      if (audioRef.current && audioRef.current.paused && !cancelled) {
        audioRef.current.play().catch(() => {});
        resumed = true;
      }
      if (
        typeof window !== "undefined" &&
        "speechSynthesis" in window &&
        window.speechSynthesis.paused
      ) {
        try {
          window.speechSynthesis.resume();
          resumed = true;
        } catch {
          // Same — graceful fallback to no-op.
        }
      }
      if (typeof window !== "undefined") {
        console.debug("[narration] resumed after dropped ambient", { resumed });
      }
      return resumed;
    };

    const spokenText = stripTtsNoise(text);

    /**
     * Free fallback for when ElevenLabs is unavailable (quota_exceeded,
     * rate_limited, transient 5xx). Uses the browser's native
     * SpeechSynthesis API — instant, no API key, no credits, but
     * voice quality is OS-dependent. macOS has decent voices;
     * Linux/Windows are workable. We don't pick a specific voice
     * (`getVoices()` is locale + OS dependent) — let the browser
     * choose its default for the current locale.
     */
    const speakViaBrowserFallback = () => {
      if (cancelled) return false;
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        return false;
      }
      try {
        const utt = new SpeechSynthesisUtterance(spokenText);
        utt.rate = narrationRateRef.current;
        utt.pitch = 1.0;
        utt.volume = narrationMutedRef.current
          ? 0
          : narrationVolumeRef.current;

        // Estimate duration so we can safety-net the onend event.
        // ~150 wpm average speaking rate; floor 2s, 2x estimated as
        // headroom.
        const wordCount = spokenText.split(/\s+/).filter(Boolean).length;
        const estimatedMs = Math.max(2000, (wordCount / 150) * 60_000);
        let safetyTimer: ReturnType<typeof setTimeout> | null = null;

        const finish = () => {
          if (safetyTimer) {
            clearTimeout(safetyTimer);
            safetyTimer = null;
          }
          if (!cancelled) { setIsNarrating(false); fireEnded(); }
        };
        utt.onend = finish;
        utt.onerror = finish;

        // Drive the state machine synchronously around speak(). Don't
        // rely on `onstart` — Chrome/Safari sometimes silently skip
        // firing it (autoplay policy before user gesture, very short
        // utterances), which would leave isTtsLoading stuck true and
        // jam the lesson's auto-advance forever.
        setIsTtsLoading(false);
        setIsNarrating(true);

        // Safety net: if onend never fires (browser flakiness), force
        // the narration end after 2× estimated duration so auto-advance
        // can still proceed.
        safetyTimer = setTimeout(finish, estimatedMs * 2);

        // Hook the safety timer into the cancel chain so an early
        // cancel clears the timer too.
        const prevCancel = cancelLatestNarrationRef.current;
        cancelLatestNarrationRef.current = () => {
          if (safetyTimer) {
            clearTimeout(safetyTimer);
            safetyTimer = null;
          }
          prevCancel?.();
        };

        window.speechSynthesis.speak(utt);
        return true;
      } catch {
        return false;
      }
    };

    const run = async () => {
      try {
        const res = await fetch("/api/agent/text-to-speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: spokenText }),
        });
        if (cancelled) return;
        if (!res.ok) {
          // ElevenLabs unavailable — out of credits, rate-limited, or
          // transient upstream error. Fall back to the browser's
          // native SpeechSynthesis so playback continues for free.
          // No-op (sets loading/narrating false) if the browser has
          // no speech support.
          if (!speakViaBrowserFallback()) {
            setIsTtsLoading(false);
            setIsNarrating(false);
            fireEnded();
          }
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;

        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.preload = "auto";
        audio.playbackRate = narrationRateRef.current;
        audio.volume = narrationMutedRef.current
          ? 0
          : narrationVolumeRef.current;
        audioRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          if (!cancelled) { setIsNarrating(false); fireEnded(); }
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          if (!cancelled) { setIsNarrating(false); fireEnded(); }
        };

        if (cancelled || isChattingRef.current) return;

        // Wait until the browser has buffered enough to play to the end
        // without stalling before calling play(). Starting play() on a
        // fresh Audio element often clips the first ~50-100ms of audio,
        // which shows up as "y" sounding like "i" for narrations that
        // start with a single-letter variable. canplaythrough closes
        // that window.
        const startPlayback = () => {
          if (cancelled || isChattingRef.current) return;
          audio
            .play()
            .then(() => {
              if (!cancelled && !isChattingRef.current) {
                setIsTtsLoading(false);
                setIsNarrating(true);
              }
            })
            .catch(() => {
              URL.revokeObjectURL(url);
              audioRef.current = null;
              if (!cancelled) {
                setIsTtsLoading(false);
                setIsNarrating(false);
                fireEnded();
              }
            });
        };
        if (audio.readyState >= 4 /* HAVE_ENOUGH_DATA */) {
          startPlayback();
        } else {
          audio.addEventListener("canplaythrough", startPlayback, { once: true });
          // Safety net: if canplaythrough never fires (rare but possible
          // for short audio), fall back to play() after a short delay.
          setTimeout(() => {
            if (!cancelled && audio.readyState > 0 && audio.paused) startPlayback();
          }, 400);
        }
      } catch {
        if (!cancelled) { setIsTtsLoading(false); setIsNarrating(false); fireEnded(); }
      }
    };

    run();
    return () => { cancelled = true; };
  }, []);

  // Auto-narrate all steps on arrival:
  // teaching: narrates the displayText/narration (what's being shown)
  // predict/fill_blank/check_in/pulse_check: narrates the QUESTION text so the tutor reads it aloud
  useEffect(() => {
    // React strict mode double-fires this in dev. If this effect is
    // re-entering for the SAME userStepIndex we already started, skip so
    // the cleanup below doesn't kill an in-flight fetch that the next
    // mount would then have to re-issue.
    if (lastNarratedStepRef.current === userStepIndex) return;
    // Hold narration while the intro video owns the audio + canvas.
    // Don't stamp lastNarratedStepRef here, so handleIntroFinished can
    // narrate this step once the intro clears.
    if (introActiveRef.current) return;
    lastNarratedStepRef.current = userStepIndex;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (isChattingRef.current) return;

    const step = whiteboardSteps[userStepIndex];
    if (!step) return;

    const narration = getStepNarrationText(step);
    if (!narration) return;

    const cancel = playNarration(narration);

    return () => {
      cancel?.();
      setIsTtsLoading(false);
      setIsNarrating(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userStepIndex, playNarration]);

  // Wire the voice-driven narration-resume callback. Rebuilt every
  // render so the closure captures the latest playNarration, current
  // step, and isChatting flag without needing the consumer
  // (dispatchVoiceUtterance, which is memoized with empty deps) to
  // re-bind. We bypass the lesson player's replayCurrent because the
  // narration effect's `lastNarratedStepRef === userStepIndex` dedup
  // would skip the re-narrate — instead we call playNarration directly
  // with the current step's text.
  replayCurrentNarrationRef.current = () => {
    if (isChattingRef.current) return; // chat takeover owns audio
    const step = whiteboardSteps[userStepIndex];
    const narration = getStepNarrationText(step);
    if (!narration) return;
    playNarration(narration);
  };

  // Practice hint phase → TTS + orb caption. Mirrors the in-lesson
  // interaction hint behaviour: hints no longer render as canvas
  // callouts, they speak and surface under the orb.
  useEffect(() => {
    if (lessonPhase !== "practice" || !currentPracticeProblem) return;
    if (practiceHintPhase === "hinted") {
      const t = currentPracticeProblem.hint?.trim();
      if (t) {
        playNarration(t);
        setTransientCaption(t);
      }
    } else if (practiceHintPhase === "detailed") {
      const t =
        currentPracticeProblem.detailedHint?.trim() ||
        currentPracticeProblem.hint?.trim();
      if (t) {
        playNarration(t);
        setTransientCaption(t);
      }
    } else {
      // "answering" / "revealed" — clear stale hint caption.
      setTransientCaption(null);
    }
  }, [practiceHintPhase, currentPracticeProblem, lessonPhase, playNarration]);

  // ── Auto-advance teaching steps when narration + animation done ─────

  useEffect(() => {
    const step = whiteboardSteps[userStepIndex];
    if (!step) return;
    // Only auto-advance teaching steps (not interactions)
    const t = step.action.type;
    if (t === "check_in" || t === "predict" || t === "fill_blank" || t === "pulse_check") return;
    if (isLastStep) return;
    if (isChatting) return;
    // Freeze the player on step 0 while the intro video plays. When it
    // finishes, handleIntroFinished replays + narrates the current step,
    // which re-arms this effect (narration gates it until TTS ends).
    if (lessonPhase === "intro") return;

    if (paused) return;

    if (playerState === "waiting" && !isNarrating && !isTtsLoading) {
      advanceRef.current();
    }
  }, [playerState, isNarrating, isTtsLoading, isLastStep, isChatting, userStepIndex, whiteboardSteps, paused, lessonPhase]);

  // Callback for predict/fill_blank/check_in: arm a "pending advance" flag.
  // The effect below waits until the congratulatory narration finishes
  // playing (isNarrating + isTtsLoading both false, AFTER having seen
  // narration active) before advancing, so short audio doesn't get
  // clipped on a fixed timer.
  const [pendingInteractionAdvance, setPendingInteractionAdvance] = useState(false);
  const narrationStartedRef = useRef(false);
  const handleInteractionAnswer = useCallback((wasCorrect: boolean) => {
    narrationStartedRef.current = false;
    lastInteractionWasCorrectRef.current = wasCorrect;
    if (wasCorrect) setCorrectNonce((n) => n + 1);
    else setWrongNonce((n) => n + 1);
    setPendingInteractionAdvance(true);
  }, []);

  // Triggered by an interaction card on a wrong answer. Seeds the chat
  // agent with structured wrong-answer context (hidden from the UI),
  // opens the tutor overlay, and lets the agent stream a response. The
  // ChatOverlay renders in `mode="takeover"` and the page footer swaps
  // its input form for "Explain more" / "Got it" buttons.
  // Mode "hint" (1st wrong) seeds a gentle nudge and "Got it" lets the
  // student retry without advancing. Mode "walkthrough" (2nd wrong)
  // seeds a full explanation and "Got it" advances + marks not-correct.
  const handleInteractionTakeover = useCallback(
    (ctx: TakeoverContext) => {
      const hintLine = ctx.hint ? `\nAuthor's hint: ${ctx.hint}` : "";
      const detailedLine = ctx.detailedHint
        ? `\nAuthor's deeper hint: ${ctx.detailedHint}`
        : "";
      const directive = `\n\nWalk them through this conversationally, building intuition. Do not immediately state the answer; lead them to it.`;
      const seed =
        `The student answered "${ctx.studentAnswer}" but the correct answer is "${ctx.correctAnswer}".\n` +
        `Question: ${ctx.question}\n` +
        `Reference explanation: ${ctx.explanation}` +
        hintLine +
        detailedLine +
        directive;
      setInteractionTakeover(ctx);
      setIsChatting(true);
      // No flying-answer animation on takeover: this hand-off is
      // auto-initiated by the Athena-generated seed prompt below, not a
      // message the student typed. Animating text up into the Extra Help
      // panel would read as "the student just sent this," which is
      // misleading on an auto-fired takeover. The fly transition is
      // reserved for genuine student input (typed / voice / handwritten)
      // in submitChatText.
      chat.sendChat(seed, { hidden: true });
    },
    [chat],
  );

  const handleExplainMore = useCallback(() => {
    chat.explainMore();
  }, [chat]);

  const handleGotIt = useCallback(() => {
    // Takeover only fires on the final wrong — closing it always
    // advances the lesson and marks not-correct. We advance directly
    // via wrappedAdvance instead of handleInteractionAnswer's
    // narration-wait flow (chat audio has been silenced by clearChat,
    // so the wait would always hit the 2.5s fallback).
    setInteractionTakeover(null);
    closeChat();
    lastInteractionWasCorrectRef.current = false;
    wrappedAdvance();
  }, [closeChat, wrappedAdvance]);

  useEffect(() => {
    if (!pendingInteractionAdvance) return;
    if (isNarrating || isTtsLoading) {
      narrationStartedRef.current = true;
    }
    // One timer at a time, never both:
    //   - Before narration starts: 2.5s fallback so a TTS error / muted /
    //     quota state doesn't stall the lesson.
    //   - After narration starts AND finishes: 400ms breath, then advance.
    //   - While narration is in flight: no timer — wait for the next state
    //     change. The old code re-armed the fallback unconditionally on
    //     every effect run, which capped narration at ~2.5s and cut off
    //     longer explanations (pulse_check rationale, multi-sentence hints).
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (!narrationStartedRef.current) {
      timer = setTimeout(() => {
        setPendingInteractionAdvance(false);
        advanceRef.current();
      }, 2500);
    } else if (!isNarrating && !isTtsLoading) {
      timer = setTimeout(() => {
        setPendingInteractionAdvance(false);
        advanceRef.current();
      }, 400);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [pendingInteractionAdvance, isNarrating, isTtsLoading]);

  // Transition out of the lesson phase when the last teaching step lands.
  // Routes through "wrap-up" first when a video URL is provided (the
  // silent, caption-free MP4 whose narration we speak live in the chosen
  // voice — see the wrap-up pacing block below); otherwise straight to
  // "practice". Practice problems pre-fetch in parallel either way so
  // they're ready when the student lands on them.
  const announcedPracticeRef = useRef(false);
  useEffect(() => {
    if (skipPractice) return;
    if (isLastStep && lessonPhase === "lesson") {
      // Prefetch practice problems as soon as we reach the end, even while the
      // last step's narration is still playing, so they're ready on arrival.
      if (!providedPracticeProblems && fetchedPracticeProblems.length === 0 && !prefetchedRef.current) {
        fetchPracticeProblems();
      }
      if (wrapUpVideoUrl) {
        // Silence any in-flight micro-lesson narration before the wrap-up
        // narration starts, otherwise two voices overlap.
        cancelLatestNarrationRef.current?.();
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        setLessonPhase("wrap-up");
      } else {
        // Don't flip to the practice/done view while the narrator is still
        // talking (e.g. finishing the last step or a question). Wait for TTS
        // to end; this effect re-fires when isNarrating/isTtsLoading clear.
        if (isNarrating || isTtsLoading) return;
        setLessonPhase("practice");
      }
    }
  }, [isLastStep, lessonPhase, providedPracticeProblems, fetchedPracticeProblems.length, fetchPracticeProblems, skipPractice, wrapUpVideoUrl, isNarrating, isTtsLoading]);

  // Intro → lesson transition. Fires when the intro video ends naturally
  // or the student clicks Skip. The step player has been frozen on step 0
  // (or hasn't reached it yet if generation is still streaming). We replay
  // the current step so the student sees it animate, and narrate it
  // directly — the narration effect won't re-fire on a phase change (its
  // deps are [userStepIndex, playNarration]), and replayCurrent alone
  // doesn't re-narrate (the lastNarratedStepRef dedup guard). If no step
  // has arrived yet, the normal narration effect picks it up once it does,
  // since introActiveRef is now false.
  const handleIntroFinished = useCallback(() => {
    if (lessonPhase !== "intro") return;
    setLessonPhase("lesson");
    const step = whiteboardSteps[userStepIndex];
    if (userStepIndex >= 0 && step) {
      // Stamp the dedup ref so the narration effect doesn't also fire,
      // then narrate + replay this step ourselves.
      lastNarratedStepRef.current = userStepIndex;
      replayCurrent();
      const narration = getStepNarrationText(step);
      if (narration) playNarration(narration);
    }
  }, [lessonPhase, whiteboardSteps, userStepIndex, replayCurrent, playNarration]);

  // ── Wrap-up beat pacing ──────────────────────────────────────────────
  // The wrap-up MP4 is silent + caption-free (its narration used to be
  // baked in, which clashed with a student's chosen tutor voice). We now
  // speak each beat's line via playNarration() (chosen voice, routed
  // through the athena_voice cookie) and re-render its caption in-app,
  // advancing to the next beat only when BOTH the video has reached that
  // beat's baked boundary AND the beat's narration has finished. A slower
  // voice holds the video on the boundary frame; a faster voice waits for
  // the visual. All cross-callback state lives in refs so the 1Hz lesson
  // timer's re-renders don't tear down the wiring; wrapBeatIndex is the
  // only React state (drives the visible caption — changes ≤6× total).
  const wrapBeats = useMemo(() => wrapUpNarration ?? [], [wrapUpNarration]);
  const wrapBeatsRef = useRef(wrapBeats);
  wrapBeatsRef.current = wrapBeats;
  const [wrapBeatIndex, setWrapBeatIndex] = useState(0);
  const wrapBeatIndexRef = useRef(0);
  const wrapReachedBoundaryRef = useRef(false);
  const wrapNarrationDoneRef = useRef(false);
  const wrapVideoRef = useRef<HTMLVideoElement | null>(null);
  const wrapSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True only while the wrap-up is actively pacing — guards async
  // callbacks (narration end, safety timer, video events) from acting
  // after Skip / unmount / phase change.
  const wrapActiveRef = useRef(false);
  // Holds the latest tryAdvance fn so ref-stored callbacks (timer,
  // narration onEnded, video events) always call the current closure.
  const tryAdvanceWrapBeatRef = useRef<() => void>(() => {});
  // Per-beat liveness backstop: if narration never signals completion
  // (e.g. a network hang), force the gate open so the video can't freeze
  // on a boundary forever. Far longer than any real line — not the normal
  // advance path.
  const WRAP_BEAT_MAX_MS = 20_000;

  const clearWrapSafetyTimer = useCallback(() => {
    if (wrapSafetyTimerRef.current) {
      clearTimeout(wrapSafetyTimerRef.current);
      wrapSafetyTimerRef.current = null;
    }
  }, []);

  // Wrap-up → practice transition. Fires when the last beat completes,
  // when a URL-only wrap-up (no narration timeline) ends, or on Skip.
  // Cancels any in-flight wrap-up narration so it doesn't bleed into the
  // practice phase.
  const handleWrapUpFinished = useCallback(() => {
    wrapActiveRef.current = false;
    clearWrapSafetyTimer();
    cancelLatestNarrationRef.current?.();
    setLessonPhase("practice");
  }, [clearWrapSafetyTimer]);

  // Start (or resume into) beat `i`: reset the gate, resume the video for
  // this beat's visuals, speak the line, and arm the liveness backstop.
  const startWrapBeat = useCallback(
    (i: number) => {
      if (!wrapActiveRef.current) return;
      const beat = wrapBeatsRef.current[i];
      if (!beat) return;
      wrapBeatIndexRef.current = i;
      setWrapBeatIndex(i);
      wrapReachedBoundaryRef.current = false;
      wrapNarrationDoneRef.current = false;
      clearWrapSafetyTimer();
      // Resume playback for this beat's visuals. The element's `autoPlay`
      // covers the very first start if this play() loses an autoplay race.
      wrapVideoRef.current?.play().catch(() => {});
      wrapSafetyTimerRef.current = setTimeout(() => {
        if (!wrapActiveRef.current || wrapBeatIndexRef.current !== i) return;
        wrapNarrationDoneRef.current = true;
        tryAdvanceWrapBeatRef.current();
      }, WRAP_BEAT_MAX_MS);
      playNarration(beat.narration, {
        onEnded: () => {
          // Ignore a late callback from a beat we've already left.
          if (!wrapActiveRef.current || wrapBeatIndexRef.current !== i) return;
          wrapNarrationDoneRef.current = true;
          tryAdvanceWrapBeatRef.current();
        },
      });
    },
    [playNarration, clearWrapSafetyTimer],
  );

  // Advance only when BOTH gates are open: the video reached the beat
  // boundary AND the beat's narration finished. Past the last beat →
  // leave the wrap-up.
  const tryAdvanceWrapBeat = useCallback(() => {
    if (!wrapActiveRef.current) return;
    if (!wrapReachedBoundaryRef.current || !wrapNarrationDoneRef.current) return;
    const next = wrapBeatIndexRef.current + 1;
    if (next >= wrapBeatsRef.current.length) {
      handleWrapUpFinished();
      return;
    }
    startWrapBeat(next);
  }, [startWrapBeat, handleWrapUpFinished]);
  tryAdvanceWrapBeatRef.current = tryAdvanceWrapBeat;

  // Video timeupdate: when the current beat's baked boundary is reached,
  // pause the video there and try to advance (held until narration ends).
  const handleWrapTimeUpdate = useCallback(() => {
    if (!wrapActiveRef.current) return;
    const v = wrapVideoRef.current;
    const beat = wrapBeatsRef.current[wrapBeatIndexRef.current];
    if (!v || !beat) return;
    if (v.currentTime >= beat.endS - 0.05) {
      if (!v.paused) v.pause();
      wrapReachedBoundaryRef.current = true;
      tryAdvanceWrapBeatRef.current();
    }
  }, []);

  // Video ended: covers the final beat's boundary. A URL-only wrap-up
  // (no narration timeline) just finishes here — preserves prior behavior.
  const handleWrapEnded = useCallback(() => {
    if (wrapBeatsRef.current.length === 0) {
      handleWrapUpFinished();
      return;
    }
    if (!wrapActiveRef.current) return;
    wrapReachedBoundaryRef.current = true;
    tryAdvanceWrapBeatRef.current();
  }, [handleWrapUpFinished]);

  // Enter the wrap-up: activate pacing and start beat 0. The video
  // element autoplays muted; startWrapBeat drives narration + the gate.
  // Only paces when a narration timeline is present — URL-only wrap-ups
  // fall through to plain playback (handleWrapEnded finishes them).
  useEffect(() => {
    if (lessonPhase !== "wrap-up" || wrapBeats.length === 0) return;
    wrapActiveRef.current = true;
    startWrapBeat(0);
    return () => {
      wrapActiveRef.current = false;
      clearWrapSafetyTimer();
    };
  }, [lessonPhase, wrapBeats.length, startWrapBeat, clearWrapSafetyTimer]);

  // Announce the practice phase via TTS once when we enter it. Guarded
  // by a ref so React strict mode's double-fire doesn't queue two
  // narrations back-to-back.
  useEffect(() => {
    if (lessonPhase !== "practice") return;
    if (announcedPracticeRef.current) return;
    announcedPracticeRef.current = true;
    playNarration(pickPracticeIntroPhrase());
  }, [lessonPhase, playNarration]);

  // Mark complete when all practice problems are done
  useEffect(() => {
    if (lessonPhase === "practice" && activePracticeProblems.length > 0 && currentProblemIndex >= activePracticeProblems.length) {
      setLessonPhase("complete");
    }
  }, [lessonPhase, activePracticeProblems.length, currentProblemIndex]);

  // Stable callbacks for the practice pane. PracticePane runs an
  // auto-advance timer in a useEffect whose deps include onCorrect /
  // onExhausted; if those references change between scheduling and
  // firing, the cleanup clears the original timer and the latch
  // prevents re-scheduling — so the answer never advances. useCallback
  // keeps the identities stable across parent re-renders.
  const handlePracticeCorrect = useCallback(() => {
    // Save the final pane state so a future Prev navigation shows
    // the completed problem in its terminal "revealed" form.
    const idx = currentProblemIndexRef.current;
    if (latestPaneStateRef.current) {
      practiceHistoryRef.current.set(idx, latestPaneStateRef.current);
    }
    setPracticeCorrectCount((c) => c + 1);
    setCorrectNonce((n) => n + 1);
    setCurrentProblemIndex((i) => {
      const next = i + 1;
      maxVisitedIndexRef.current = Math.max(
        maxVisitedIndexRef.current,
        next,
      );
      return next;
    });
  }, []);
  const handlePracticeExhausted = useCallback(() => {
    const idx = currentProblemIndexRef.current;
    // Exhausted without solving — a clear "needs more work" signal.
    struggledPracticeIndicesRef.current.add(idx);
    if (latestPaneStateRef.current) {
      practiceHistoryRef.current.set(idx, latestPaneStateRef.current);
    }
    setWrongNonce((n) => n + 1);
    setCurrentProblemIndex((i) => {
      const next = i + 1;
      maxVisitedIndexRef.current = Math.max(
        maxVisitedIndexRef.current,
        next,
      );
      return next;
    });
  }, []);
  const handlePracticeWrong = useCallback(() => {
    // At least one wrong attempt — flag the problem as struggled even if the
    // student eventually gets it right on a retry.
    struggledPracticeIndicesRef.current.add(currentProblemIndexRef.current);
    playNarration(pickPracticeRetryPhrase());
    setWrongNonce((n) => n + 1);
  }, [playNarration]);
  // Bumped on every wrong selection inside CheckInCard / PredictCard /
  // FillBlankCard, not just the final reveal. Drives the dog's "failed"
  // flash on first-wrong-with-hint, where `onAnswer` doesn't fire.
  const handleInteractionWrong = useCallback(() => {
    setWrongNonce((n) => n + 1);
  }, []);
  const handleRevealedCorrect = useCallback(() => {
    setRevealedCorrect(true);
  }, []);
  // Mirror the pane's internal state so a Prev/Next click can save
  // it before swapping the problem. The callback is stable so the
  // pane's onStateChange useEffect doesn't churn.
  const handlePracticeStateChange = useCallback(
    (state: PracticePaneSavedState) => {
      latestPaneStateRef.current = state;
    },
    [],
  );
  const handlePracticePrev = useCallback(() => {
    const idx = currentProblemIndexRef.current;
    if (idx <= 0) return;
    // Stash the current pane state before navigating away so Next
    // can rehydrate it.
    if (latestPaneStateRef.current) {
      practiceHistoryRef.current.set(idx, latestPaneStateRef.current);
    }
    setCurrentProblemIndex(idx - 1);
  }, []);
  const handlePracticeNext = useCallback(() => {
    const idx = currentProblemIndexRef.current;
    // Next only navigates within visited history — students still
    // have to complete the current problem to push the frontier
    // (handlePracticeCorrect / handlePracticeExhausted bump
    // maxVisitedIndex). Without this gate, Next would let them skip
    // unanswered problems.
    if (idx >= maxVisitedIndexRef.current) return;
    if (latestPaneStateRef.current) {
      practiceHistoryRef.current.set(idx, latestPaneStateRef.current);
    }
    setCurrentProblemIndex(idx + 1);
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // ── Chat input handlers ──────────────────────────────────────────────

  // Auto-resize textarea
  useEffect(() => {
    const ta = chatTextareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 56) + "px";
  }, [chatInput]);

  // Shared submit path used by both the typed-form submit and the
  // voice-utterance dispatch. Takes the text explicitly so the voice
  // path doesn't need to round-trip through `chatInput` state (which
  // hits a stale-closure race where the synthetic submit fires before
  // React commits the setChatInput update).
  const submitChatText = useCallback(
    (raw: string, opts?: { viaVoice?: boolean }) => {
      const text = raw.trim();
      if (!text) return;
      // Chat-busy guard. Without surfacing, a voice utterance that
      // arrives while the previous chat round-trip is still streaming
      // is silently dropped — the student sees their words transcribed
      // (via the orb caption) but no chat action happens. Failure mode
      // is most common when an ambient-noise transcript slipped past
      // the filter and kicked off a phantom chat: any subsequent real
      // utterance is then locked out until the phantom completes.
      // Fix: hold the text in the textarea so it's recoverable, toast
      // the student, and resume narration if it was canceled by the
      // upstream onSpeechRealStart.
      if (chat.isProcessing) {
        setChatInput(text);
        if (chatTextareaRef.current) {
          chatTextareaRef.current.style.height = "auto";
        }
        toast.info("Hold on — still answering. Your message is in the box.");
        // Lesson narration was PAUSED on speech-start. Since no chat
        // round-trip is taking over, resume from where we paused
        // (preserves position); fall back to replay-from-start if
        // there was nothing actually paused (e.g. audio was still
        // loading when the student spoke).
        if (speechCanceledNarrationRef.current) {
          speechCanceledNarrationRef.current = false;
          const resumed = resumeLatestNarrationRef.current?.() ?? false;
          if (!resumed) replayCurrentNarrationRef.current?.();
        }
        return;
      }
      // Close-intent detector — only fires when there's actually a chat
      // session to close (active takeover OR isChatting). Otherwise
      // a tutor-bleed transcript that happens to be "yeah" or "cool"
      // would trigger closeChat() → replayCurrent(), which cancels
      // the lesson's in-flight TTS. If there's no open chat, an
      // affirmative utterance is just dropped silently — sending
      // "yeah" alone to the agent would produce a confused response.
      const chatIsOpen = isChatting || !!interactionTakeover;
      if (chatIsOpen && isCloseIntent(text)) {
        setChatInput("");
        if (chatTextareaRef.current) chatTextareaRef.current.style.height = "auto";
        if (interactionTakeover) {
          handleGotIt();
        } else {
          closeChat();
        }
        return;
      }
      // No chat open and the utterance reads as a bare affirmative —
      // drop it. Don't open a new chat with "yeah" as the seed.
      if (!chatIsOpen && isCloseIntent(text)) {
        setChatInput("");
        if (chatTextareaRef.current) chatTextareaRef.current.style.height = "auto";
        return;
      }
      setIsChatting(true);
      // The chat round-trip is about to take over narration (the agent
      // streams a response which the chat-narration cursor speaks).
      // Clear the voice-cancel flag so dispatchVoiceUtterance doesn't
      // schedule a redundant replayCurrent on top, AND fully discard
      // the paused lesson narration so it doesn't sit in memory or
      // accidentally resume later.
      speechCanceledNarrationRef.current = false;
      cancelLatestNarrationRef.current?.();
      // During an active takeover, route through askFollowup so the
      // prior tutor turn anchors the agent's continuation. Outside
      // takeover, still pass `appendCanvas: true` so follow-up
      // messages accumulate on the chat canvas instead of wiping
      // prior tutor content — the chat-summary divider already gives
      // the student a way to collapse the section if it gets long.
      // Pull the pending image (if any) and clear before sending so
      // a follow-up message doesn't re-attach the same image. The
      // `askFollowup` path skips images — it's the agent-anchored
      // continuation of a takeover, not the student attaching new
      // context. Image flows only through the regular `sendChat` path.
      const img = pendingImageRef.current;
      // Spoken acknowledgement — only on the voice path. A typed message
      // doesn't need an audible "give me a moment" (the student is
      // looking at the screen). Fills the agent round-trip gap with TTS +
      // caption; cleared when the tutor's first real step speaks.
      if (opts?.viaVoice) chat.acknowledge();
      triggerFlyingAnswer(text);
      if (interactionTakeover) {
        chat.askFollowup(text);
      } else {
        chat.sendChat(text, {
          appendCanvas: true,
          ...(img ? { image: img } : {}),
        });
      }
      setChatInput("");
      if (img) setPendingImage(null);
      if (chatTextareaRef.current) chatTextareaRef.current.style.height = "auto";
    },
    [chat, interactionTakeover, isChatting, handleGotIt, closeChat, triggerFlyingAnswer],
  );

  const handleChatSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      submitChatText(chatInput);
    },
    [chatInput, submitChatText],
  );

  // Auto-enter chat mode when voice recording triggers processing
  useEffect(() => {
    if (chat.isProcessing && !isChatting) {
      setIsChatting(true);
    }
  }, [chat.isProcessing, isChatting]);

  // ── Always-listening voice → chat dispatch (with barge-in) ───────────
  // Silero VAD listens continuously. On speech-start while the tutor is
  // talking, we CANCEL the in-flight TTS (lesson narration or chat
  // narration) so the student is heard — that's the "interrupt"
  // semantic. On speech-end, the captured utterance gets transcribed
  // and dispatched through the same routing as a typed chat message.
  const sttInFlightRef = useRef(false);
  // Hold the latest submit fn in a ref so the dispatch closure (which
  // gets locked into the voice-activity hook on mount) always invokes
  // the freshest version — picks up new chat / interactionTakeover
  // references without resubscribing the VAD.
  const submitChatTextRef = useRef(submitChatText);
  submitChatTextRef.current = submitChatText;

  // Refs to the active interaction cards — voice dispatch uses these
  // to programmatically trigger option selection through the same
  // handleSelect path a click would. Only one card is mounted at a
  // time (the AnimatePresence below renders exactly one of CheckIn /
  // Predict / FillBlank based on the current step), so only one ref
  // is live at any given moment.
  const checkInCardRef = useRef<InteractionCardHandle | null>(null);
  const predictCardRef = useRef<InteractionCardHandle | null>(null);
  const fillBlankCardRef = useRef<InteractionCardHandle | null>(null);
  const pulseCheckCardRef = useRef<InteractionCardHandle | null>(null);
  // Stable refs to the currently-active interaction so the dispatch
  // closure sees fresh values without re-binding the VAD.
  const currentCheckInRef = useRef(currentCheckIn);
  currentCheckInRef.current = currentCheckIn;
  const currentPredictionRef = useRef(currentPrediction);
  currentPredictionRef.current = currentPrediction;
  const currentFillBlankRef = useRef(currentFillBlank);
  currentFillBlankRef.current = currentFillBlank;
  const currentPulseCheckRef = useRef(currentPulseCheck);
  currentPulseCheckRef.current = currentPulseCheck;

  const dispatchVoiceUtterance = useCallback(async (audio: Blob) => {
    if (sttInFlightRef.current) return;
    sttInFlightRef.current = true;
    // Resume narration if the dispatch ends up dropping the transcript
    // without taking another action. onSpeechRealStart eagerly canceled
    // any in-flight narration (set speechCanceledNarrationRef.current).
    // Real-action paths (matched answer, fill-blank fill, chat dispatch)
    // clear the flag without resuming because they take over narration;
    // every other early-return path falls through to this finally hook.
    const resumeNarrationIfDropped = () => {
      if (!speechCanceledNarrationRef.current) return;
      speechCanceledNarrationRef.current = false;
      // Prefer pause/resume (preserves narration position); fall back
      // to a full replay if the pause-side had nothing to grab (e.g.
      // audio was still loading when speech-start fired).
      const resumed = resumeLatestNarrationRef.current?.() ?? false;
      if (!resumed) replayCurrentNarrationRef.current?.();
    };
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
      if (!rawTranscript) {
        resumeNarrationIfDropped();
        return;
      }
      // Drop ambient-sound annotations the STT model occasionally
      // emits — "(upbeat music)", "[Music]", "(coughs)", etc.
      if (isAmbientNoiseTranscript(rawTranscript)) {
        console.debug("[voice→chat] dropped ambient transcript:", rawTranscript);
        resumeNarrationIfDropped();
        return;
      }
      // Strip embedded ambient markers ("Add four to both sides
      // (instrumental music plays).") so the matcher / chat sees just
      // the spoken content. Bracketed math like "(x + 4)" survives —
      // cleanTranscript only targets natural-language paren patterns
      // (letters + spaces only).
      const trimmed = cleanTranscript(rawTranscript);
      if (!trimmed) {
        // The strip removed everything that was left (e.g. a transcript
        // that's nothing but markers slipped past the ambient check
        // somehow). Treat as ambient.
        console.debug("[voice→chat] empty after marker strip:", rawTranscript);
        resumeNarrationIfDropped();
        return;
      }
      // Length floor only applies when NO interaction is awaiting
      // input. Short transcripts ("B", "5", "yes") are legitimate
      // answers; we mustn't drop them. During teaching steps with
      // no interaction, short transcripts are usually STT noise
      // ("you", "thanks", "hmm") so we still filter those.
      const isInteractionActive =
        !!(currentCheckInRef.current || currentPredictionRef.current || currentFillBlankRef.current || currentPulseCheckRef.current);
      if (!isInteractionActive && trimmed.length < 4) {
        resumeNarrationIfDropped();
        return;
      }

      // Important: keep speechCanceledNarrationRef SET through the
      // action paths. Each terminal action either (a) clears the flag
      // because it takes over narration (selectByIndex / setText), or
      // (b) delegates to submitChatText which handles the flag itself
      // — in particular submitChatText's chat-busy guard now resumes
      // narration before bailing so a phantom-chat-from-noise doesn't
      // leave the canvas frozen.

      // ── Multi-choice answer matching (regex layer) ───────────────
      // Run this BEFORE the question-shape heuristic. A confident
      // option match is the strongest signal of student intent —
      // even multi-word utterances that LOOK question-shaped by word
      // count (e.g. "Add four to both sides (instrumental music
      // plays)." → 8 raw words, would otherwise trip the >6-word
      // gate in looksLikeQuestionOrComment) should select the
      // matched option. matchByRegex's 6 layers (letter, ordinal,
      // number word, digit, exact text, longest substring) are all
      // high-precision and synchronous; if any matches, the student
      // clearly meant that option.
      // Real-utterance dispatches below all call this to fully
      // discard the paused lesson narration. Speech-start only
      // PAUSED — we now know the utterance is real and that the
      // next action takes over, so we don't want the paused audio
      // to linger / accidentally resume on a future event.
      const discardPausedNarration = () => {
        speechCanceledNarrationRef.current = false;
        cancelLatestNarrationRef.current?.();
      };
      const ci = currentCheckInRef.current;
      const pr = currentPredictionRef.current;
      const pc = currentPulseCheckRef.current;
      if (ci) {
        const idx = matchByRegex(trimmed, ci.options);
        if (idx !== null) {
          discardPausedNarration();
          checkInCardRef.current?.selectByIndex?.(idx);
          return;
        }
      } else if (pr) {
        const idx = matchByRegex(trimmed, pr.options);
        if (idx !== null) {
          discardPausedNarration();
          predictCardRef.current?.selectByIndex?.(idx);
          return;
        }
      } else if (pc) {
        const idx = matchByRegex(trimmed, pc.options);
        if (idx !== null) {
          discardPausedNarration();
          pulseCheckCardRef.current?.selectByIndex?.(idx);
          return;
        }
      }

      // ── Question / comment short-circuit ────────────────────────
      // Regex matcher missed. Now check whether the utterance looks
      // like a clarifying question — if yes, skip the fuzzier paths
      // (LLM judge + fill-blank populate) and route straight to chat.
      // ("I can't see the equation", "what does this mean", "show me
      // a graph"). Without this gate the LLM judge sometimes picks
      // a wrong option for a clearly non-answer utterance, denying
      // the student the help they actually asked for.
      const isQuestionShaped = looksLikeQuestionOrComment(trimmed);

      // ── LLM judge for multi-choice ──────────────────────────────
      // Async + fuzzy — only run when regex missed AND the utterance
      // doesn't read as a question.
      if (ci && !isQuestionShaped) {
        const llmIdx = await matchByLLM(trimmed, ci.options, ci.question);
        if (llmIdx !== null) {
          discardPausedNarration();
          checkInCardRef.current?.selectByIndex?.(llmIdx);
          return;
        }
      } else if (pr && !isQuestionShaped) {
        const llmIdx = await matchByLLM(trimmed, pr.options, pr.question);
        if (llmIdx !== null) {
          discardPausedNarration();
          predictCardRef.current?.selectByIndex?.(llmIdx);
          return;
        }
      } else if (pc && !isQuestionShaped) {
        const llmIdx = await matchByLLM(trimmed, pc.options, pc.question);
        if (llmIdx !== null) {
          discardPausedNarration();
          pulseCheckCardRef.current?.selectByIndex?.(llmIdx);
          return;
        }
      }

      // ── Fill-blank: route transcript into the input field ───────
      // Don't auto-submit — a misheard transcript that submits a wrong
      // answer would trigger takeover (2nd-wrong escalates). The
      // student reviews the populated text and presses Check. We
      // still let question-shaped utterances pass through to chat
      // (a student asking "what is x" during fill_blank shouldn't
      // get "what is x" pasted into their answer field).
      if (currentFillBlankRef.current && !isQuestionShaped) {
        // The fill-blank card's own answer flow takes over from here.
        // Discard the paused lesson narration so it doesn't linger.
        discardPausedNarration();
        fillBlankCardRef.current?.setText?.(normalizeFillBlankInput(trimmed));
        return;
      }

      // No matched option (or no interaction active) — fall through to
      // the shared chat submit path. submitChatText handles the
      // narration-resume flag internally (it resumes when chat.isProcessing
      // bails the dispatch, otherwise the chat round-trip takes over
      // narration). Bypasses chatInput state entirely so there's no
      // stale-closure race.
      submitChatTextRef.current(trimmed, { viaVoice: true });
    } catch (err) {
      console.error("[voice→chat] STT failed:", err);
      toast.error("Couldn't hear that — try again.");
      // STT errored — the user's narration was canceled but no action
      // is taking over. Replay so the lesson doesn't sit silently frozen.
      resumeNarrationIfDropped();
    } finally {
      sttInFlightRef.current = false;
    }
  }, []);

  // VAD threshold policy lives in voice-listening-state.ts as a
  // pure function over named flags. Adding a new signal that
  // affects the policy means adding it to ListeningStateInputs and
  // updating deriveVoiceListeningState — both unit-tested. The
  // hook maps phase → threshold via an exhaustiveness-checked
  // switch, so a new phase can't ship without an explicit
  // threshold decision.
  const voiceListeningState = deriveVoiceListeningState({
    micActive: true, // boot-time decision; chip mute is its own gate
    isChatting,
    isChatProcessing: chat.isProcessing,
    isChatSpeaking: chat.isSpeaking,
    isChatNarrating: chat.isChatNarrating,
    isLessonNarrating: isNarrating,
    isLessonTtsLoading: isTtsLoading,
    isAwaitingInteractionAnswer: isInteraction,
  });

  const voice = useVoiceActivity({
    // Barge-in is wired to `onSpeechRealStart`, NOT `onSpeechStart`.
    // The "real start" fires only after Silero confirms the speech has
    // sustained past minSpeechMs — filters tutor-TTS echo bursts
    // before they can cancel the tutor's own voice.
    onSpeechRealStart: () => {
      // Record whether anything was narrating so the dispatch path
      // can resume on a dropped transcript. If nothing was narrating
      // (e.g., we were already on an awaiting-input step) we don't
      // want to spuriously re-narrate when ambient noise gets
      // filtered.
      //
      // PAUSE instead of cancel: an extended ambient transcript (a
      // sustained noise burst that doesn't STT to actual content)
      // should drop the student back into the SAME narration at the
      // SAME position — not restart the step from frame 0. If the
      // utterance turns out to be real, the dispatch paths below
      // explicitly discard via cancelLatestNarrationRef before
      // handing off to the next action.
      speechCanceledNarrationRef.current = !!pauseLatestNarrationRef.current;
      pauseLatestNarrationRef.current?.();
      chat.stopAudio?.();
    },
    onSpeechEnd: (audio) => dispatchVoiceUtterance(audio),
    onError: (err) => {
      console.error("[voice-activity]", err);
      if (err.name === "NotAllowedError") {
        toast.error("Microphone access denied. Enable it in your browser to talk to Athena.");
      }
    },
    // The hook reconciles state → threshold internally via the
    // exhaustiveness-checked threshold mapping. See
    // voice-listening-state.ts for the policy.
    listeningState: voiceListeningState,
    // Boot the mic in the OFF (muted) position. The stream still opens
    // so flipping it on mid-lesson is instant, but VAD stays gated
    // until the student clicks the mic — keeps a noisy room from
    // misfiring the always-listening answer matcher. Click to enable.
    initialMuted: true,
  });

  // Boot the mic when the lesson surface mounts.
  useEffect(() => {
    voice.start();
    return () => voice.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChatKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleChatSubmit(e);
      }
    },
    [handleChatSubmit],
  );

  // ── Playback control handlers ────────────────────────────────────────
  // Track-style transport: previous step / play-pause / next step.
  // Step nav cancels in-flight narration before seeking so the new
  // step's narration starts cleanly.
  const handlePlaybackBack = useCallback(() => {
    cancelLatestNarrationRef.current?.();
    cancelLatestNarrationRef.current = null;
    // Reset narration-effect dedup guard so the previous step
    // re-narrates instead of being skipped by the
    // `lastNarratedStepRef === userStepIndex` guard inside the
    // narration effect.
    lastNarratedStepRef.current = -1;
    // Deliberate navigation — reveal the target step (re-arm follow).
    setResumeFollowNonce((n) => n + 1);
    seekTo(userStepIndex - 1);
  }, [seekTo, userStepIndex]);
  const handlePlaybackForward = useCallback(() => {
    cancelLatestNarrationRef.current?.();
    cancelLatestNarrationRef.current = null;
    lastNarratedStepRef.current = -1;
    setResumeFollowNonce((n) => n + 1);
    seekTo(userStepIndex + 1);
  }, [seekTo, userStepIndex]);
  const handleTogglePaused = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  // Speaker popover — click the speaker key to open, click-outside or
  // Escape to close. State + a ref to the popover wrapper so the
  // click-outside listener can compare event.target. Without the
  // wrapper-ref check, the listener would fire-and-close on the same
  // click that just opened the popover.
  const [volumePopoverOpen, setVolumePopoverOpen] = useState(false);
  const volumePopoverWrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!volumePopoverOpen) return;
    function handleDocClick(e: MouseEvent) {
      if (
        volumePopoverWrapRef.current &&
        !volumePopoverWrapRef.current.contains(e.target as Node)
      ) {
        setVolumePopoverOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setVolumePopoverOpen(false);
    }
    document.addEventListener("mousedown", handleDocClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleDocClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [volumePopoverOpen]);

  // ── Keyboard shortcuts for playback controls ─────────────────────────
  // Mirror the on-screen keypad: arrow keys drive the same actions,
  // spacebar toggles play/pause. Gated to avoid hijacking text input
  // (textarea / input / contenteditable) and chat context where the
  // student is reading the tutor's explanation. Practice phase is
  // also excluded — that surface owns its own Prev/Next chevrons and
  // shouldn't react to lesson-step shortcuts.
  useEffect(() => {
    if (lessonPhase !== "lesson") return;
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tag = target.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      // Don't hijack shortcuts during a chat takeover — the student is
      // likely reading the tutor's explanation and an arrow press
      // shouldn't accidentally advance the lesson.
      if (isChattingRef.current) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          handleTogglePaused();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handlePlaybackBack();
          break;
        case "ArrowRight":
          e.preventDefault();
          handlePlaybackForward();
          break;
        case "r":
        case "R":
          // Replay the current step's animation + narration. No-op
          // before the first step renders.
          if (userStepIndex >= 0) {
            e.preventDefault();
            replayCurrent();
          }
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    lessonPhase,
    handleTogglePaused,
    handlePlaybackBack,
    handlePlaybackForward,
    replayCurrent,
    userStepIndex,
  ]);

  // ── Derived state ────────────────────────────────────────────────────

  const emptyVisibleIds = useMemo(() => new Set<number>(), []);
  const isPracticeCanvas = (lessonPhase === "practice" || lessonPhase === "complete") && !isChatting;
  const isPracticeQuestionCanvas =
    lessonPhase === "practice" && !isChatting && !!currentPracticeProblem;

  // Synthesize a single-step canvas displaying the practice question.
  // Practice problems don't currently ship `whiteboardSteps`, so we
  // render the question text / equation as the canvas. If the problem
  // ever gains `whiteboardSteps` we use those as-is.
  const practiceCanvasSteps = useMemo<WhiteboardStep[]>(() => {
    if (!currentPracticeProblem) return [];
    const withSteps = currentPracticeProblem as Problem & {
      whiteboardSteps?: WhiteboardStep[];
    };
    if (withSteps.whiteboardSteps && withSteps.whiteboardSteps.length > 0) {
      return withSteps.whiteboardSteps;
    }
    return synthesizeQuestionStep(currentPracticeProblem);
  }, [currentPracticeProblem]);
  const practiceCanvasVisibleIds = useMemo<Set<number>>(
    () => new Set(practiceCanvasSteps.map((s) => s.id)),
    [practiceCanvasSteps],
  );

  // Stable references for the canvas props. Without these, every parent
  // re-render passed a fresh `steps` array and a fresh `visibleStepIds`
  // Set, invalidating downstream useMemo chains (layout, viewBoxHeight,
  // simplifiedLatexByStepId) and re-firing the auto-scroll effect on
  // every keystroke. The smooth-scroll triggered scroll events that
  // toggled `showLatestButton`, which re-rendered the canvas, which
  // re-fired wb-math's measurement effect → infinite loop on the
  // debug scrubber.
  const canvasSteps = useMemo<WhiteboardStep[]>(() => {
    const out = [...whiteboardSteps];
    if (interactionVisualStep) out.push(interactionVisualStep);
    for (const s of hintCalloutSteps) out.push(s);
    for (const s of answerCalloutSteps) out.push(s);
    for (const s of practiceHintCalloutSteps) out.push(s);
    return out;
  }, [
    whiteboardSteps,
    interactionVisualStep,
    hintCalloutSteps,
    answerCalloutSteps,
    practiceHintCalloutSteps,
  ]);

  const canvasVisibleIds = useMemo<Set<number>>(() => {
    // During practice the canvas is normally blank, but if there are
    // practice hint callouts we surface those (and only those) so the
    // student sees the hint without the prior lesson's content.
    if (isPracticeCanvas) {
      if (practiceHintCalloutSteps.length === 0) return emptyVisibleIds;
      const ids = new Set<number>();
      for (const s of practiceHintCalloutSteps) ids.add(s.id);
      return ids;
    }
    const ids = new Set(visibleStepIds);
    if (interactionVisualStep) ids.add(interactionVisualStep.id);
    for (const s of hintCalloutSteps) ids.add(s.id);
    for (const s of answerCalloutSteps) ids.add(s.id);
    return ids;
  }, [
    isPracticeCanvas,
    emptyVisibleIds,
    visibleStepIds,
    interactionVisualStep,
    hintCalloutSteps,
    answerCalloutSteps,
    practiceHintCalloutSteps,
  ]);

  const canvasCurrentStepIndex = practiceHintCalloutSteps.length
    ? whiteboardSteps.length +
      (interactionVisualStep ? 1 : 0) +
      hintCalloutSteps.length +
      answerCalloutSteps.length +
      practiceHintCalloutSteps.length -
      1
    : answerCalloutSteps.length
      ? whiteboardSteps.length +
        (interactionVisualStep ? 1 : 0) +
        hintCalloutSteps.length +
        answerCalloutSteps.length -
        1
      : hintCalloutSteps.length
        ? whiteboardSteps.length + (interactionVisualStep ? 1 : 0) + hintCalloutSteps.length - 1
        : interactionVisualStep
          ? whiteboardSteps.length
          : currentStepIndex;

  const canvasStepProgress =
    hintCalloutSteps.length ||
    answerCalloutSteps.length ||
    practiceHintCalloutSteps.length ||
    interactionVisualStep
      ? 1
      : stepProgress;

  const voiceOrbState: "idle" | "listening" | "processing" | "speaking" =
    chat.isRecording ? "listening" : chat.isProcessing ? "processing" : chat.isSpeaking ? "speaking" : "idle";

  // ── Generating state ──────────────────────────────────────────────
  const isGenerating = phase === "generating" && whiteboardSteps.length === 0;

  // ── Observation orb state ────────────────────────────────────────────
  const orbState: "idle" | "thinking" | "speaking" | "listening" = chat.isRecording
    ? "listening"
    : chat.isProcessing || isTtsLoading || isGenerating
      ? "thinking"
      : chat.isSpeaking || chat.isChatNarrating || isNarrating
        ? "speaking"
        : "idle";

  // ── Dog progress ─────────────────────────────────────────────────────
  // The bone-trail at the bottom of the canvas. The dog walks toward the
  // bone as the lesson advances, and changes pose based on what the app
  // is doing right now (narrating, waiting for input, stuck in tutor,
  // celebrating a correct answer, etc.).
  const dogState = useDogState({
    isGenerating,
    isChatting,
    hasTakeover: !!interactionTakeover,
    hasPendingInteraction:
      !!(currentCheckIn || currentPrediction || currentFillBlank || currentPulseCheck) ||
      lessonPhase === "practice",
    orbState,
    lessonPhase,
    correctNonce,
    wrongNonce,
  });
  const dogProgress = (() => {
    if (lessonPhase === "complete") return 1;
    if (lessonPhase === "practice") {
      const total = Math.max(1, activePracticeProblems.length);
      return 0.8 + 0.2 * Math.min(1, practiceCorrectCount / total);
    }
    if (totalSteps <= 0) return 0;
    return 0.8 * Math.min(1, currentStepIndex / Math.max(1, totalSteps - 1));
  })();

  const lastUserMessage = chat.chatMessages.findLast((m) => m.role === "user" && !m.hidden)?.content;

  return (
    <ObservationFrame onBack={onClose}>
      {/* Ambient background-music element. Looping, low volume; playback
          is driven by the musicOn + lessonPhase effect above. Hidden. */}
      {ambientMusicUrl && (
        <audio
          ref={musicAudioRef}
          src={ambientMusicUrl}
          loop
          preload="auto"
          className="hidden"
          aria-hidden="true"
        />
      )}
      {/* Error state */}
      {phase === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="font-mono text-sm uppercase tracking-[0.2em] text-red-400">
            Signal lost — lesson failed to generate.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="border-[var(--obs-border)] bg-transparent text-[var(--obs-fg)] hover:bg-[var(--obs-surface)]"
          >
            Go Back
          </Button>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* Canvas area — flex column. The lesson Canvas fills the
              available space; when a chat takeover ("I don't get it" /
              free chat) is active, an inline divider + chat Canvas
              stack below the lesson. The divider doubles as a
              click-to-collapse toggle so the student can refocus on
              the lesson without losing the prior tutor explanation.
              The orb is a floating ambient indicator in the top-left
              corner. The "Resume lesson" pill (when chatting) floats
              top-right via ChatOverlay. */}
          <div className="relative flex-1 min-h-0 flex flex-col">
            {debugOrb ? (
              (() => {
                // Roaming "living" orb (?debug=orb). Same caption text
                // source as the fixed orb below — kept in sync so flag
                // on/off only changes positioning, not content.
                const lessonText =
                  transientCaption ?? whiteboardSteps[userStepIndex]?.displayText ?? "";
                const chatStep =
                  chat.chatNarrationIndex >= 0
                    ? chat.chatWhiteboardSteps[chat.chatNarrationIndex]
                    : null;
                const chatText = chatStep?.displayText ?? "";
                const captionText =
                  (chat.acknowledgement ?? (isChatting ? chatText : lessonText)).trim() || null;
                // Mode: dock to Extra Help during takeover/chat; draw (act as
                // the pen) while a diagram teaching step animates; else rest.
                const drawing =
                  playerState === "animating" &&
                  isDiagramStep(whiteboardSteps[currentStepIndex]);
                const orbMode = interactionTakeover || isChatting
                  ? "dock"
                  : drawing
                    ? "draw"
                    : "rest";
                return (
                  <PresenceLayer
                    orbState={orbState}
                    amplitude={chat.amplitude}
                    size={isMobilePortrait ? 60 : 100}
                    captionText={captionText}
                    mode={orbMode}
                    restAnchor={isMobilePortrait ? { x: 40, y: 40 } : { x: 62, y: 62 }}
                    penClientRef={penClientRef}
                    stepFocusRef={stepFocusRef}
                    spotlightRef={spotlightRef}
                    dockTargetRef={chatPanelRef}
                    suppressCaption={orbMode === "draw"}
                  />
                );
              })()
            ) : (
            <div className="absolute top-3 left-3 z-20 flex flex-col items-center gap-2 pointer-events-none w-[220px]">
              {/* Re-enable pointer events on the orb itself — the
                  surrounding container keeps `pointer-events-none` so
                  the caption below doesn't block lesson-canvas
                  interaction, but the orb core needs clicks to open
                  the character + voice picker. */}
              <div className="pointer-events-auto">
                <ObservationOrb
                  state={orbState}
                  amplitude={chat.amplitude}
                  size={isMobilePortrait ? 60 : 100}
                />
              </div>
              {(() => {
                // Caption text mirrors what the tutor is currently
                // saying — but the `narration` field is the phonetic
                // string we feed to TTS (no LaTeX, no `$`, no
                // backslashes), so it'd render as bare prose with
                // mangled math. Use `displayText` (the LaTeX-aware
                // visual version) instead. If a step doesn't carry a
                // displayText, no caption shows for that step.
                const lessonText =
                  transientCaption ??
                  whiteboardSteps[userStepIndex]?.displayText ??
                  "";
                const chatStep =
                  chat.chatNarrationIndex >= 0
                    ? chat.chatWhiteboardSteps[chat.chatNarrationIndex]
                    : null;
                const chatText = chatStep?.displayText ?? "";
                // The spoken acknowledgement caption ("Give me a
                // moment.") wins until the tutor's first real step
                // narration takes over, at which point it's cleared.
                const text = (
                  chat.acknowledgement ?? (isChatting ? chatText : lessonText)
                ).trim();
                if (!text) return null;
                return (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={text}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.25 }}
                      className="obs-serif text-center text-base leading-snug text-[var(--obs-fg)] rounded-xl px-4 py-2 backdrop-blur-md shadow-lg shadow-black/10 border border-white/5 max-w-[640px]"
                      style={{
                        background:
                          "color-mix(in oklch, var(--obs-surface) 70%, transparent)",
                      }}
                    >
                      <MathContent content={text} size="base" />
                    </motion.div>
                  </AnimatePresence>
                );
              })()}
            </div>
            )}
            {/* Replay-button removed per UX feedback. The `R` keyboard
                shortcut still calls `replayCurrent` via the playback
                keydown effect, and the chat takeover surface still
                uses replayCurrent internally — only the visible button
                is gone. */}
            <div className="flex-1 min-h-0 flex flex-col">
            <IsoContourFrame bottomCenterLabel="" bottomRightLabel="">
              <div className="relative h-full w-full">
                {/* Waiting symbol — centered over the canvas while a
                    spoken utterance is in flight to the tutor (the
                    spoken acknowledgement caption shows the words under
                    the orb; this is the silent "working" visual).
                    `chat.acknowledgement` is set the instant the voice
                    utterance dispatches and cleared the moment the
                    tutor's first real step begins speaking. */}
                <AnimatePresence>
                  {chat.acknowledgement && (
                    <motion.div
                      key="thinking-indicator"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2"
                    >
                      <ThinkingIndicator size={64} />
                    </motion.div>
                  )}
                </AnimatePresence>
                {/* Audio indicator — first-narration affordance. Pulses
                    once and self-dismisses after 4s. Surfaces audio
                    mode for students who'd otherwise miss it. */}
                <AnimatePresence>
                  {showAudioIndicator && (
                    <motion.div
                      key="audio-indicator"
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                      className="pointer-events-none absolute inset-x-0 top-3 z-30 mx-auto flex w-fit max-w-[calc(100%-1rem)] items-center gap-2 whitespace-nowrap rounded-full border border-[var(--obs-border)] bg-[var(--obs-surface)]/90 px-4 py-2 text-sm font-medium text-[var(--obs-fg)] shadow-lg backdrop-blur-md"
                    >
                      <motion.span
                        className="inline-block h-2 w-2 rounded-full bg-[var(--obs-accent)]"
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{
                          duration: 1.2,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      />
                      <span>Athena will narrate this lesson</span>
                    </motion.div>
                  )}
                </AnimatePresence>
                {/* Top-right dog progress strip — the dog walks toward
                    the bone as the lesson advances and changes pose
                    based on what's happening (running while narrating,
                    sitting while waiting, sleeping while generating,
                    celebrating on correct). Hidden during generation
                    and during the practice / complete phases (those
                    surfaces own their own progress UI). */}
                {!isGenerating &&
                  lessonPhase === "lesson" &&
                  totalSteps > 0 && (
                    <div className="pointer-events-none absolute right-4 top-3 z-20 w-[min(347px,53%)]">
                      <DogProgress
                        state={dogState}
                        progress={dogProgress}
                        scale={0.7}
                      />
                    </div>
                  )}
                <AnimatePresence mode="wait">
                  {lessonPhase === "intro" && introVideoUrl ? (
                    <motion.div
                      key="intro-video"
                      className="relative flex h-full w-full items-center justify-center bg-black"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                    >
                      <video
                        src={introVideoUrl}
                        autoPlay
                        playsInline
                        controls={false}
                        onEnded={handleIntroFinished}
                        className="h-full w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={handleIntroFinished}
                        className="absolute bottom-4 right-4 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
                      >
                        Skip intro →
                      </button>
                    </motion.div>
                  ) : isGenerating ? (
                    <motion.div
                      key="skeleton"
                      className="relative h-full w-full"
                      exit={{ opacity: 0, scale: 1.02, filter: "blur(4px)" }}
                      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                    >
                      <WhiteboardSkeleton className="h-full" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <GenerationProgress />
                      </div>
                    </motion.div>
                  ) : lessonPhase === "complete" ? (
                    <motion.div
                      key="complete"
                      className="flex h-full w-full items-center justify-center"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    >
                      <div className="relative flex flex-col items-center gap-3 text-center">
                        <CheckInConfetti />
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 200, damping: 15 }}
                        >
                          <CheckCircle className="h-12 w-12 text-green-500" />
                        </motion.div>
                        <p className="text-base font-semibold">
                          {practiceCorrectCount}/{activePracticeProblems.length} correct
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {practiceCorrectCount === activePracticeProblems.length
                            ? "Perfect! Great work on this lesson."
                            : "Keep it up, you're making progress!"}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                          {getSessionId() ? (
                            <DownloadReportButton
                              kind="micro-lesson"
                              sessionId={getSessionId()}
                              snapshot={{
                                chatMessages: chat.chatMessages
                                  .filter((m) => !m.hidden)
                                  .map((m) => ({ role: m.role, content: m.content })),
                                perStepAttempts: [],
                                stepTimings: [],
                                learningObjectives: metadata.learningObjectives ?? [],
                                keyFormulas: metadata.keyFormulas ?? [],
                                topicName: topic,
                                subtopicName: subtopic,
                              }}
                              variant="outline"
                            />
                          ) : null}
                          <Button
                            size="sm"
                            variant="secondary"
                            className="gap-1.5"
                            disabled={specializedPractice.isStarting}
                            onClick={() => {
                              const wrongQuestionTexts = Array.from(
                                struggledPracticeIndicesRef.current
                              )
                                .map((i) => activePracticeProblems[i]?.questionText)
                                .filter((t): t is string => !!t);
                              specializedPractice.startPractice({
                                topicName: topic,
                                subtopicName: subtopic,
                                wrongQuestionTexts,
                              });
                            }}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            {specializedPractice.isStarting
                              ? "Building set…"
                              : "Practice weak areas"}
                          </Button>
                          <Button size="sm" className="gap-1" onClick={onClose}>
                            Done
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  ) : lessonPhase === "wrap-up" && wrapUpVideoUrl ? (
                    <motion.div
                      key="wrap-up-video"
                      className="relative flex h-full w-full items-center justify-center bg-black"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    >
                      <video
                        ref={wrapVideoRef}
                        src={wrapUpVideoUrl}
                        autoPlay
                        // Paced wrap-ups are silent (TTS speaks the script in
                        // the chosen voice); muting also guarantees autoplay.
                        // A URL-only wrap-up keeps whatever audio it carries.
                        muted={wrapBeats.length > 0}
                        playsInline
                        controls={false}
                        onTimeUpdate={handleWrapTimeUpdate}
                        onEnded={handleWrapEnded}
                        className="h-full w-full object-contain"
                      />
                      {/* In-app subtitle for the current beat — replaces the
                          baked-in caption, kept in sync with the spoken
                          narration (the pacer changes wrapBeatIndex). */}
                      {wrapBeats.length > 0 ? (
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={`wrap-caption-${wrapBeatIndex}`}
                            className="pointer-events-none absolute inset-x-0 bottom-[8%] flex justify-center px-[11%]"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.3 }}
                          >
                            <p className="max-w-[78%] text-center text-2xl font-medium leading-snug text-white [text-shadow:0_0_12px_rgba(0,0,0,0.7)]">
                              {wrapBeats[wrapBeatIndex]?.caption}
                            </p>
                          </motion.div>
                        </AnimatePresence>
                      ) : null}
                      <button
                        type="button"
                        onClick={handleWrapUpFinished}
                        className="absolute bottom-4 right-4 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
                      >
                        Skip →
                      </button>
                    </motion.div>
                  ) : isPracticeQuestionCanvas ? (
                    <motion.div
                      key={`practice-canvas-${currentPracticeProblem?.id ?? "x"}`}
                      className="relative h-full w-full"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    >
                      {/* Canvas-level "Correct!" pulse. Sits above the
                          whiteboard canvas (where attention is) rather
                          than inside the bottom interaction pane.
                          Mirrors PracticeWhiteboardContent's pulse and
                          tutor-practice-card.tsx's overlay. */}
                      <AnimatePresence>
                        {revealedCorrect ? (
                          <motion.div
                            key="practice-correct-pulse"
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
                      <Canvas
                        steps={practiceCanvasSteps}
                        visibleStepIds={practiceCanvasVisibleIds}
                        currentStepIndex={Math.max(0, practiceCanvasSteps.length - 1)}
                        stepProgress={1}
                        equalScaleCoords
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="canvas"
                      className="h-full w-full"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    >
                      {isMobilePortrait ? (
                        <div data-lesson-renderer="mobile" className="h-full w-full overflow-y-auto pt-20">
                          <MobileLessonRenderer
                            steps={canvasSteps}
                            visibleStepIds={canvasVisibleIds}
                            currentStepIndex={canvasCurrentStepIndex}
                            stepProgress={canvasStepProgress}
                          />
                        </div>
                      ) : (
                        <Canvas
                          steps={canvasSteps}
                          visibleStepIds={canvasVisibleIds}
                          currentStepIndex={canvasCurrentStepIndex}
                          stepProgress={canvasStepProgress}
                          equalScaleCoords
                          resumeFollowNonce={resumeFollowNonce}
                          onPenTip={debugOrb ? handlePenTip : undefined}
                          sequentialDiagrams={debugOrb}
                          onStepFocus={debugOrb ? handleStepFocus : undefined}
                          onOrbSpotlight={debugOrb ? handleSpotlight : undefined}
                        />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </IsoContourFrame>
            </div>

            {/* Right-side chat panel — overlays the right portion of the
                canvas region during a tutor takeover or free chat. The
                student can collapse it to a thin handle on the right
                edge to refocus on the lesson canvas without ending the
                chat session; prior tutor turns remain accumulated in
                chatRenderSteps and re-appear when the panel is shown
                again.
                TODO(follow-up): preserve a "chat interaction" marker
                pinned to the lesson step where this side-quest
                happened, so when the student revisits / scrolls past
                that step the interaction is still discoverable. Today
                the side-quest evaporates entirely on closeChat. */}
            {isChatting && chatRenderSteps.length > 0 && (
              chatCollapsed ? (
                <button
                  type="button"
                  onClick={() => setChatCollapsed(false)}
                  className="absolute right-0 top-1/2 z-30 -translate-y-1/2 flex flex-col items-center gap-2 rounded-l-md border border-r-0 border-[var(--obs-border)] bg-[var(--obs-surface)] px-2 py-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--obs-fg)] shadow-lg backdrop-blur transition-colors hover:bg-[var(--obs-surface)]/80"
                  aria-expanded={false}
                  aria-label="Show chat panel"
                  title="Show chat"
                >
                  <ChevronLeft className="h-4 w-4 text-[var(--obs-muted)]" />
                  <Sparkles className="h-3.5 w-3.5 text-[var(--obs-glow-mid)]" />
                  <span style={{ writingMode: "vertical-rl" }} className="text-[var(--obs-muted)]">
                    Chat
                  </span>
                </button>
              ) : (
                <div ref={chatPanelRef} className="absolute right-0 top-0 bottom-0 z-20 flex w-[40%] min-w-[340px] max-w-[560px] flex-col border-l border-[var(--obs-border)] bg-[var(--obs-bg)]">
                  {/* "Extra Help" title bar — a deliberate break marker
                      so the side-trip reads as a distinct moment, not an
                      AI-generated summary band. No border/fill chrome.
                      The title doubles as the collapse toggle; the
                      Resume-lesson button lives up here (free chat only —
                      takeover exits via "Got it" in the footer, same
                      gating as before). */}
                  <div className="shrink-0 flex items-center gap-3 px-4 pt-3 pb-1">
                    <button
                      type="button"
                      onClick={() => setChatCollapsed(true)}
                      className="group flex min-w-0 items-center gap-2 text-left"
                      aria-expanded={true}
                      aria-label="Collapse chat panel"
                    >
                      <Sparkles className="h-4 w-4 shrink-0 text-[var(--obs-glow-mid)]" />
                      <span className="shrink-0 font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--obs-fg)]">
                        Extra Help
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--obs-muted)] opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                    <div className="flex-1" />
                    {/* Resume-lesson pill — visible during free chat;
                        suppressed during takeover (the only exit there
                        is "Got it" in the footer). Click calls closeChat
                        which clears chat state and replays the current
                        lesson step. */}
                    {!interactionTakeover && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={closeChat}
                        className="shrink-0 gap-1"
                      >
                        Resume lesson
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="relative flex-1 min-h-0">
                    {/* Reflow the tutor takeover / chat content onto a
                        narrower logical board than the full-lesson 1000.
                        This panel is only ~340–560px wide, so the canvas's
                        renderedWidth/contentWidth scale would otherwise
                        render everything at 0.34–0.56× (tiny). A 640-unit
                        board lifts that to ~0.53–0.88× — near full-lesson
                        legibility — and equations auto-fit-to-width so
                        nothing overflows the tighter board. */}
                    <Canvas
                      steps={chatRenderSteps}
                      visibleStepIds={chatVisibleIds}
                      currentStepIndex={Math.max(0, chatRenderSteps.length - 1)}
                      stepProgress={1}
                      equalScaleCoords
                      contentWidth={640}
                    />
                  </div>
                </div>
              )
            )}

            {/* In-canvas "Draw on the board" overlay. Covers the whole
                board region (above the Extra Help panel's z-20) so the
                board momentarily becomes the writing surface; the ink
                morphs into typeset LaTeX which auto-sends to the tutor. */}
            <AnimatePresence>
              {drawingInline && (
                <BoardDrawOverlay
                  key="board-draw-overlay"
                  topic={topic}
                  subtopic={subtopic}
                  onSuppressVoice={voice.setSuppressed}
                  onClose={() => setDrawingInline(false)}
                  onAttachImage={(blob) => setPendingImage(blob)}
                  onRecognized={(recognized) => submitChatText(`$${recognized}$`)}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Bottom interaction pane — questions / inputs / practice card.
              Hidden during teaching steps (canvas covers everything),
              during chat (chat content takes the spotlight), and during
              the complete-celebration overlay (rendered on canvas). */}
          {!isGenerating && !isChatting && lessonPhase !== "complete" && (
            <AnimatePresence mode="wait">
              {isCheckIn && currentCheckIn ? (
                <motion.div
                  key={`bottom-check-in-${userStepIndex}`}
                  className="shrink-0 bg-[var(--obs-surface)] px-4 py-4 sm:px-8 sm:py-6"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="mx-auto w-full max-w-[720px]">
                    <CheckInCard
                      key={`check-in-${userStepIndex}`}
                      ref={checkInCardRef}
                      checkIn={currentCheckIn}
                      onAnswer={handleInteractionAnswer}
                      onNarrate={(text) => playNarration(text)}
                      onReveal={setInteractionAnswerReveal}
                      onTakeover={handleInteractionTakeover}
                      onCaption={setTransientCaption}
                      onWrong={handleInteractionWrong}
                    />
                  </div>
                </motion.div>
              ) : currentPrediction ? (
                <motion.div
                  key={`bottom-predict-${userStepIndex}`}
                  className="shrink-0 bg-[var(--obs-surface)] px-4 py-4 sm:px-8 sm:py-6"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="mx-auto w-full max-w-[720px]">
                    <PredictCard
                      ref={predictCardRef}
                      predict={currentPrediction}
                      onAnswer={handleInteractionAnswer}
                      onNarrate={(text) => playNarration(text)}
                      onHintPhase={setInteractionHintPhase}
                      onReveal={setInteractionAnswerReveal}
                      onTakeover={handleInteractionTakeover}
                      onCaption={setTransientCaption}
                      onWrong={handleInteractionWrong}
                    />
                  </div>
                </motion.div>
              ) : currentFillBlank ? (
                <motion.div
                  key={`bottom-fill-blank-${userStepIndex}`}
                  className="shrink-0 bg-[var(--obs-surface)] px-4 py-4 sm:px-8 sm:py-6"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="mx-auto w-full max-w-[720px]">
                    <FillBlankCard
                      ref={fillBlankCardRef}
                      fillBlank={currentFillBlank}
                      onAnswer={handleInteractionAnswer}
                      onNarrate={(text) => playNarration(text)}
                      onReveal={setInteractionAnswerReveal}
                      onTakeover={handleInteractionTakeover}
                      onCaption={setTransientCaption}
                      onWrong={handleInteractionWrong}
                    />
                  </div>
                </motion.div>
              ) : currentPulseCheck ? (
                <motion.div
                  key={`bottom-pulse-check-${userStepIndex}`}
                  className="shrink-0 bg-[var(--obs-surface)] px-4 py-4 sm:px-8 sm:py-6"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="mx-auto w-full max-w-[720px]">
                    <PulseCheckCard
                      ref={pulseCheckCardRef}
                      pulseCheck={currentPulseCheck}
                      onAnswer={handleInteractionAnswer}
                      onNarrate={(text) => playNarration(text)}
                      onReveal={setInteractionAnswerReveal}
                      onCaption={setTransientCaption}
                    />
                  </div>
                </motion.div>
              ) : lessonPhase === "practice" ? (
                <motion.div
                  key="bottom-practice"
                  className="shrink-0 bg-[var(--obs-surface)] px-4 py-4 sm:px-8 sm:py-6"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="mx-auto w-full max-w-[720px] space-y-3">
                    {isPracticeLoading && activePracticeProblems.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-2">
                        <motion.div
                          animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.15, 1] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        >
                          <Sparkles className="h-6 w-6 text-athena-amber" />
                        </motion.div>
                        <p className="text-xs text-muted-foreground">Preparing practice…</p>
                      </div>
                    ) : currentPracticeProblem ? (
                      <>
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={currentPracticeProblem.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ duration: 0.2 }}
                          >
                            <PracticePane
                              problem={currentPracticeProblem}
                              questionNumber={currentProblemIndex + 1}
                              totalProblems={activePracticeProblems.length}
                              onCorrect={handlePracticeCorrect}
                              onExhausted={handlePracticeExhausted}
                              onHintPhaseChange={setPracticeHintPhase}
                              onWrong={handlePracticeWrong}
                              onRevealedCorrect={handleRevealedCorrect}
                              onPrev={handlePracticePrev}
                              onNext={handlePracticeNext}
                              canGoPrev={currentProblemIndex > 0}
                              canGoNext={
                                currentProblemIndex <
                                maxVisitedIndexRef.current
                              }
                              savedState={(() => {
                                // Defensive: drop stale saved entries
                                // whose problemId no longer matches the
                                // current problem at this index. Today
                                // that mismatch shouldn't happen — the
                                // problems load once and never change.
                                // The check is cheap insurance.
                                const saved =
                                  practiceHistoryRef.current.get(
                                    currentProblemIndex,
                                  );
                                return saved &&
                                  saved.problemId === currentPracticeProblem.id
                                  ? saved
                                  : undefined;
                              })()}
                              onStateChange={handlePracticeStateChange}
                            />
                          </motion.div>
                        </AnimatePresence>
                      </>
                    ) : null}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          )}

          {/* Floating chat pill */}
          <div className="shrink-0 flex flex-col items-center gap-2 px-4 pb-2 pt-1 sm:px-8">
            {lastUserMessage && (
              <p className="font-mono text-[11px] tracking-[0.04em] text-[var(--obs-muted)] max-w-[560px] truncate">
                → &ldquo;{lastUserMessage}&rdquo;
              </p>
            )}
            {interactionTakeover && (
              <div className="flex w-full max-w-[640px] items-center justify-center gap-3">
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
            )}
            <div className="flex w-full flex-wrap items-center justify-center gap-3">
            {/* Ambient-music toggle. Available once the intro clears so
                the student can silence the background track at any point
                during the lesson or practice. Mirrors the icon-only
                circular styling of the transport + mic buttons. */}
            {ambientMusicUrl && lessonPhase !== "intro" && (
              <button
                type="button"
                onClick={() => setMusicOn((m) => !m)}
                aria-label={musicOn ? "Turn music off" : "Turn music on"}
                aria-pressed={musicOn}
                title={musicOn ? "Music on" : "Music off"}
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors",
                  musicOn
                    ? "border-[var(--obs-glow-mid)] text-[var(--obs-fg)]"
                    : "border-[var(--obs-border)] text-[var(--obs-muted)] hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)]",
                )}
              >
                {musicOn ? (
                  <Music className="h-4 w-4" />
                ) : (
                  <Music2 className="h-4 w-4 opacity-50" />
                )}
              </button>
            )}
            {/* Always-listening mic toggle. Formerly a floating chip at
                the canvas corner; now an icon button in the transport
                row so it reads as a peer of the other controls. Icon +
                color convey the listening state; the title spells it
                out. Click toggles mute. */}
            <button
              type="button"
              onClick={voice.muted ? voice.unmute : voice.mute}
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors",
                voice.state === "denied" || voice.state === "error"
                  ? "border-red-500/50 text-red-400"
                  : voice.muted
                    ? "border-[var(--obs-border)] text-[var(--obs-muted)] hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)]"
                    : voice.state === "hearing"
                      ? "border-[var(--obs-glow-mid)] bg-[var(--obs-glow-mid)]/10 text-[var(--obs-fg)]"
                      : "border-[var(--obs-border)] text-[var(--obs-fg)] hover:border-[var(--obs-glow-mid)]",
              )}
              aria-label={voice.muted ? "Unmute microphone" : "Mute microphone"}
              title={
                voice.state === "denied"
                  ? "Mic blocked"
                  : voice.state === "error"
                    ? "Mic error"
                    : voice.muted
                      ? "Mic off — click to turn on"
                      : voice.state === "hearing"
                        ? "Hearing you — click to mute"
                        : voice.state === "listening"
                          ? "Mic On — click to mute"
                          : "Mic starting…"
              }
            >
              {voice.muted ||
              voice.state === "denied" ||
              voice.state === "error" ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic
                  className={cn(
                    "h-4 w-4",
                    voice.state === "hearing" && "animate-pulse",
                  )}
                />
              )}
            </button>
            {/* Playback controls — track-style transport (skip-back,
                play/pause, skip-forward) + sound. Icon-only buttons
                styled to match the chat mic + send buttons:
                circular, transparent fill, muted icon color promoted
                to fg on hover. Spacebar toggles play/pause; ←/→ skip
                steps (see the keyboard-shortcut effect). Sound opens
                a volume-slider popover. */}
            {lessonPhase === "lesson" && (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={handlePlaybackBack}
                  disabled={userStepIndex <= 0}
                  aria-label="Previous step"
                  title="Previous step (←)"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--obs-border)] disabled:hover:text-[var(--obs-muted)]"
                >
                  <SkipBack className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleTogglePaused}
                  aria-label={paused ? "Play" : "Pause"}
                  title={paused ? "Play (space)" : "Pause (space)"}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)]"
                >
                  {paused ? (
                    <Play className="h-4 w-4" />
                  ) : (
                    <Pause className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={handlePlaybackForward}
                  disabled={userStepIndex >= whiteboardSteps.length - 1}
                  aria-label="Next step"
                  title="Next step (→)"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[var(--obs-border)] disabled:hover:text-[var(--obs-muted)]"
                >
                  <SkipForward className="h-4 w-4" />
                </button>
                <div className="relative" ref={volumePopoverWrapRef}>
                  <button
                    type="button"
                    onClick={() => setVolumePopoverOpen((o) => !o)}
                    aria-label={
                      narrationMuted ? "Unmute narration" : "Mute narration"
                    }
                    aria-expanded={volumePopoverOpen}
                    title="Volume"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)]"
                  >
                    {narrationMuted ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </button>
                  {volumePopoverOpen && (
                    <div
                      role="dialog"
                      aria-label="Volume controls"
                      className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 z-30 w-44 rounded-md border border-[var(--obs-border)] bg-[var(--obs-surface)] p-3 shadow-lg"
                    >
                      {/* Volume slider — native range input for
                          accessibility (keyboard + screen reader
                          support out of the box). Driven by the
                          narrationVolume state; the reactive effect
                          near line ~1115 propagates the change to the
                          in-flight audio so it takes effect
                          immediately. */}
                      <label className="flex flex-col gap-1.5">
                        <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--obs-muted)]">
                          Volume {Math.round(narrationVolume * 100)}%
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={narrationVolume}
                          onChange={(e) =>
                            setNarrationVolume(parseFloat(e.target.value))
                          }
                          disabled={narrationMuted}
                          className="w-full accent-[var(--obs-glow-mid)] disabled:opacity-40"
                          aria-label="Narration volume"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setNarrationMuted((m) => !m)}
                        className={cn(
                          "mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] font-mono uppercase tracking-wide transition-colors",
                          narrationMuted
                            ? "border-[var(--obs-glow-mid)] bg-[var(--obs-glow-mid)]/10 text-[var(--obs-fg)]"
                            : "border-[var(--obs-border)] text-[var(--obs-muted)] hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)]",
                        )}
                      >
                        {narrationMuted ? (
                          <>
                            <Volume2 className="h-3.5 w-3.5" />
                            Unmute
                          </>
                        ) : (
                          <>
                            <VolumeX className="h-3.5 w-3.5" />
                            Mute
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            {!SHOW_VOICE_INPUT_MODE || chat.mode === "text" ? (
              <>
                {/* Pending image attachment strip. Sits above the form
                    so the student sees what's about to attach. Same
                    pattern as the mentor surface; image is included
                    in the next chat.sendChat call and cleared after. */}
                {pendingImage && pendingPreviewUrl && (
                  <div className="mb-2 flex w-full max-w-[640px] items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={pendingPreviewUrl}
                      alt="Pending attachment"
                      className="h-10 w-10 rounded border border-[var(--obs-border)] object-cover"
                    />
                    <span className="text-xs text-[var(--obs-muted)]">
                      Image will attach to your next message
                    </span>
                    <button
                      type="button"
                      onClick={() => setPendingImage(null)}
                      title="Remove attachment"
                      aria-label="Remove attachment"
                      className="ml-auto flex h-6 w-6 items-center justify-center rounded-full text-[var(--obs-muted)] hover:text-[var(--obs-fg)]"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              <form
                onSubmit={handleChatSubmit}
                className="flex w-full items-center gap-3 sm:w-auto sm:max-w-[640px] sm:flex-1"
              >
                {SHOW_VOICE_INPUT_MODE && (
                  <button
                    type="button"
                    onClick={chat.toggleMode}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)]"
                    title="Switch to voice"
                    aria-label="Switch to voice"
                  >
                    <Mic className="h-4 w-4" />
                  </button>
                )}
                <div className="relative flex-1">
                  <textarea
                    ref={chatTextareaRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleChatKeyDown}
                    placeholder="Type or speak…"
                    className="w-full resize-none rounded-full border border-[var(--obs-border)] bg-[var(--obs-surface)] px-5 py-2.5 text-sm text-[var(--obs-fg)] outline-none placeholder:text-[var(--obs-dim)] focus:border-[var(--obs-glow-mid)]"
                    rows={1}
                    style={{ minHeight: 40, maxHeight: 96 }}
                    disabled={isGenerating || chat.isProcessing}
                  />
                </div>
                <ImageAttachLauncher
                  onAttach={(image) => setPendingImage(image)}
                  disabled={isGenerating || chat.isProcessing}
                  renderTrigger={(open, disabled) => (
                    <button
                      type="button"
                      onClick={open}
                      disabled={disabled}
                      title="Attach an image (⌘⇧M)"
                      aria-label="Attach an image"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)] disabled:opacity-40"
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                  )}
                />
                <button
                  type="button"
                  onClick={() => setDrawingInline(true)}
                  disabled={isGenerating || chat.isProcessing || drawingInline}
                  title="Draw on the board"
                  aria-label="Draw on the board"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)] disabled:opacity-40"
                >
                  <PenLine className="h-4 w-4" />
                </button>
                <motion.button
                  type="submit"
                  whileTap={{ scale: 0.9, rotate: -12 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  disabled={!chatInput.trim() || chat.isProcessing}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)] disabled:opacity-40"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </motion.button>
              </form>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <div className="scale-[0.6] origin-center">
                  <VoiceOrb
                    state={voiceOrbState}
                    amplitude={chat.amplitude}
                    onTap={
                      chat.isRecording
                        ? chat.stopRecording
                        : chat.startRecording
                    }
                    disabled={chat.isProcessing && !chat.isRecording}
                  />
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--obs-muted)]">
                  {chat.isRecording
                    ? "LISTENING — TAP TO STOP"
                    : chat.isProcessing
                      ? "PROCESSING…"
                      : chat.isSpeaking
                        ? "SPEAKING…"
                        : "TAP TO SPEAK"}
                </span>
                <button
                  type="button"
                  onClick={chat.toggleMode}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)]"
                  aria-label="Switch to text"
                >
                  <Keyboard className="h-4 w-4" />
                </button>
              </div>
            )}
            </div>
          </div>
          {/* Flying-answer transition — see flying-answer.tsx. The
              student's just-given answer streams from the input line up
              into the Extra Help sidebar. Verified via /dev/fly +
              .local/playwright/tests/flying-answer.spec. */}
          <FlyingAnswer flying={flyingAnswer} />
        </div>
      )}
      {debugScrub && totalSteps > 0 && (
        <DebugScrubber
          totalSteps={totalSteps}
          userStepIndex={userStepIndex}
          onSeek={(idx) => {
            setPaused(true);
            seekTo(idx);
          }}
          onReplay={replayCurrent}
          paused={paused}
          onTogglePause={() => setPaused((p) => !p)}
          steps={whiteboardSteps}
        />
      )}
    </ObservationFrame>
  );
}

function DebugScrubber({
  totalSteps,
  userStepIndex,
  onSeek,
  onReplay,
  paused,
  onTogglePause,
  steps,
}: {
  totalSteps: number;
  userStepIndex: number;
  onSeek: (index: number) => void;
  onReplay: () => void;
  paused: boolean;
  onTogglePause: () => void;
  steps: WhiteboardStep[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const safeIndex = Math.max(0, Math.min(totalSteps - 1, userStepIndex));
  const step = steps[safeIndex];
  const stepLabel = step
    ? `#${step.id}${step.operation ? ` · ${step.operation}` : ""}${step.phase ? ` · ${step.phase}` : ""}`
    : "—";

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        title="Open scrubber"
        className="fixed bottom-4 left-4 z-50 select-none"
        style={{
          background: "oklch(0.18 0.06 275 / 0.92)",
          color: "oklch(0.92 0.02 285)",
          border: "1px solid oklch(0.45 0.10 275 / 0.6)",
          borderRadius: 999,
          padding: "8px 12px",
          boxShadow: "0 8px 24px oklch(0 0 0 / 0.4)",
          backdropFilter: "blur(8px)",
          fontFamily: "var(--font-mono, ui-monospace), monospace",
          fontSize: 11,
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
        }}
      >
        <span>›</span>
        <span style={{ opacity: 0.85 }}>
          SCRUB · {safeIndex + 1}/{totalSteps}
          {paused ? " · PAUSED" : ""}
        </span>
      </button>
    );
  }
  return (
    <div
      className="fixed bottom-4 left-4 z-50 select-none"
      style={{
        background: "oklch(0.18 0.06 275 / 0.92)",
        color: "oklch(0.92 0.02 285)",
        border: "1px solid oklch(0.45 0.10 275 / 0.6)",
        borderRadius: 12,
        padding: "10px 14px",
        boxShadow: "0 8px 24px oklch(0 0 0 / 0.4)",
        backdropFilter: "blur(8px)",
        minWidth: 480,
        fontFamily: "var(--font-mono, ui-monospace), monospace",
        fontSize: 11,
      }}
    >
      <div className="mb-2 flex items-center gap-4">
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="Collapse scrubber"
          className="rounded"
          style={{
            border: "1px solid oklch(0.45 0.10 275 / 0.5)",
            padding: "0 6px",
            lineHeight: "18px",
            cursor: "pointer",
          }}
        >
          ‹
        </button>
        <span style={{ opacity: 0.7, width: 70, flexShrink: 0 }}>
          SCRUB{paused ? " · PAUSED" : ""}
        </span>
        <span
          style={{
            opacity: 0.85,
            flex: "1 1 auto",
            minWidth: 0,
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
          {safeIndex + 1} / {totalSteps}
        </span>
        <div className="flex gap-1" style={{ flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => onSeek(safeIndex - 1)}
            disabled={safeIndex <= 0}
            className="rounded px-2 py-0.5 disabled:opacity-30"
            style={{ border: "1px solid oklch(0.45 0.10 275 / 0.5)" }}
          >
            ‹ prev
          </button>
          <button
            type="button"
            onClick={onTogglePause}
            className="rounded px-2 py-0.5"
            style={{
              border: "1px solid oklch(0.45 0.10 275 / 0.5)",
              background: paused ? "oklch(0.45 0.16 275 / 0.4)" : "transparent",
            }}
            title={paused ? "Resume auto-advance" : "Pause auto-advance"}
          >
            {paused ? "▶ play" : "‖ pause"}
          </button>
          <button
            type="button"
            onClick={onReplay}
            className="rounded px-2 py-0.5"
            style={{ border: "1px solid oklch(0.45 0.10 275 / 0.5)" }}
            title="Replay current step animation"
          >
            ↻ replay
          </button>
          <button
            type="button"
            onClick={() => onSeek(safeIndex + 1)}
            disabled={safeIndex >= totalSteps - 1}
            className="rounded px-2 py-0.5 disabled:opacity-30"
            style={{ border: "1px solid oklch(0.45 0.10 275 / 0.5)" }}
          >
            next ›
          </button>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={totalSteps - 1}
        value={safeIndex}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: "oklch(0.62 0.18 275)" }}
      />
      <div
        style={{
          marginTop: 6,
          opacity: 0.7,
          height: 14,
          lineHeight: "14px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
        title={stepLabel}
      >
        {stepLabel}
      </div>
    </div>
  );
}
