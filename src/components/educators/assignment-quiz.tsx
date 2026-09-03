"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Camera,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { MathContent } from "@/components/quiz/math-content";
import { ObservationFrame } from "@/components/learning/observation/observation-frame";
import { ObservationOrb } from "@/components/learning/observation/observation-orb";
import { IsoContourFrame } from "@/components/learning/observation/iso-contour-frame";
import {
  useQuestionNarration,
  stripTtsNoise,
} from "@/hooks/use-question-narration";
import {
  assembleQuizResponse,
  formatLongDate,
  isPublicFreeResponse,
  OPTION_LETTERS,
} from "@/lib/educators";
import type {
  PublicAssignmentQuestion,
  PublicQuizQuestion,
} from "@/lib/db/queries/educators";
import {
  fileToWorkPhoto,
  MAX_PHOTOS,
  SubmitterBanner,
  useSubmitWork,
  type WorkPhoto,
} from "@/components/educators/assignment-submit";

const AUDIO_PREF_KEY = "athena:hw-audio-enabled";

type QuizAssignment = {
  id: string;
  title: string;
  instructions: string;
  dueDate: string;
  questions: PublicQuizQuestion[];
};

/**
 * Full-screen, one-problem-at-a-time student view for question-based
 * homework, styled to match the non-educators SAT practice quiz: dark
 * observation chrome (frame + roaming orb + iso-contour field), the
 * problem centered as a flashcard, the question read aloud on arrival, a
 * bottom transport bar, and a top-right progress strip. Handles both
 * free-response quizzes (textarea + optional photos of paper work) and
 * multiple-choice practice sets (auto-graded at submit). The flow ends in
 * "Turn in", which routes through the same submit endpoint the legacy
 * scroll-of-cards form used, so grading/roster wiring is unchanged.
 */
export function AssignmentQuiz({ assignment }: { assignment: QuizAssignment }) {
  const questions = assignment.questions;
  const isFreeResponse = isPublicFreeResponse(questions[0]);

  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  // Free-response: one typed answer per question. Multiple-choice: the
  // chosen option index per question (-1 = unanswered).
  const [textAnswers, setTextAnswers] = useState<string[]>(() =>
    questions.map(() => ""),
  );
  const [choiceAnswers, setChoiceAnswers] = useState<number[]>(() =>
    questions.map(() => -1),
  );
  const [photos, setPhotos] = useState<WorkPhoto[]>([]);
  const [encoding, setEncoding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const raw = window.localStorage.getItem(AUDIO_PREF_KEY);
      return raw === null ? true : raw === "1";
    } catch {
      return true;
    }
  });

  const submit = useSubmitWork(assignment.id);
  const { play, cancel, orbState } = useQuestionNarration();

  const total = questions.length;
  const current = questions[index];
  const isLast = index === total - 1;

  // ── Question narration ──────────────────────────────────────────────────
  // Read the current problem aloud when it appears (and when the student
  // navigates between problems), mirroring the practice quiz. Keyed on the
  // problem id so toggling audio or editing the answer doesn't re-narrate.
  const audioEnabledRef = useRef(audioEnabled);
  audioEnabledRef.current = audioEnabled;
  const lastNarratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!started || !current) return;
    if (lastNarratedRef.current === current.id) return;
    lastNarratedRef.current = current.id;
    if (!audioEnabledRef.current) return;
    const text = stripTtsNoise(current.prompt).trim();
    if (text) play(text, { interruptible: true });
  }, [started, current, play]);

  const toggleAudio = useCallback(() => {
    setAudioEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(AUDIO_PREF_KEY, next ? "1" : "0");
      } catch {
        /* localStorage unavailable — preference is session-only */
      }
      if (!next) cancel();
      return next;
    });
  }, [cancel]);

  const goTo = useCallback(
    (next: number) => {
      cancel();
      // Re-arm narration so revisiting a problem reads it again.
      lastNarratedRef.current = null;
      setIndex(Math.max(0, Math.min(total - 1, next)));
    },
    [cancel, total],
  );

  const pickPhotos = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []).slice(
        0,
        MAX_PHOTOS - photos.length,
      );
      e.target.value = "";
      if (!files.length) return;
      setEncoding(true);
      try {
        const encoded = await Promise.all(files.map(fileToWorkPhoto));
        setPhotos((prev) => [...prev, ...encoded].slice(0, MAX_PHOTOS));
      } finally {
        setEncoding(false);
      }
    },
    [photos.length],
  );

  const answeredCount = useMemo(() => {
    return isFreeResponse
      ? textAnswers.filter((a) => a.trim()).length
      : choiceAnswers.filter((a) => a >= 0).length;
  }, [isFreeResponse, textAnswers, choiceAnswers]);

  const allChoiceAnswered = !isFreeResponse && answeredCount === total;
  const canSubmit = isFreeResponse
    ? answeredCount > 0 || photos.length > 0
    : allChoiceAnswered;

  const handleSubmit = useCallback(() => {
    if (submit.isPending || encoding || !canSubmit) return;
    cancel();
    if (isFreeResponse) {
      submit.mutate({
        response: assembleQuizResponse(questions, textAnswers),
        images: photos.map((p) => ({ data: p.data, mediaType: p.mediaType })),
      });
    } else {
      submit.mutate({ answers: choiceAnswers });
    }
  }, [
    submit,
    encoding,
    canSubmit,
    cancel,
    isFreeResponse,
    questions,
    textAnswers,
    photos,
    choiceAnswers,
  ]);

  // Stop any in-flight narration when the quiz unmounts.
  useEffect(() => () => cancel(), [cancel]);

  // ── Success screen ──────────────────────────────────────────────────────
  if (submit.isSuccess && submit.data) {
    const g = submit.data.graded;
    const message = g
      ? `You got ${g.correctCount} of ${g.total} correct. That's ${g.grade}%. Your teacher can see your score.`
      : "Your answers are turned in. Your teacher will grade them soon.";
    return (
      <QuizShell>
        <div className="flex h-full w-full items-center justify-center px-8">
          <div className="w-full max-w-[560px] rounded-2xl border border-green-500/25 bg-green-500/[0.04] p-10 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-green-400/90" />
            <h2 className="mt-4 text-2xl font-light tracking-tight text-[var(--obs-fg)]">
              Nice work, {submit.data.studentName}.
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--obs-muted)]">
              {message}
            </p>
            <button
              onClick={() => {
                submit.reset();
                setPhotos([]);
                setStarted(false);
                lastNarratedRef.current = null;
                setIndex(0);
              }}
              className="mt-7 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--obs-muted)] underline-offset-4 transition-colors hover:text-[var(--obs-fg)] hover:underline"
            >
              {g
                ? "Try again (replaces your score)"
                : "Turn in again (replaces your answers)"}
            </button>
          </div>
        </div>
      </QuizShell>
    );
  }

  // ── Intro / start screen ────────────────────────────────────────────────
  if (!started) {
    return (
      <QuizShell>
        <div className="flex h-full w-full items-center justify-center px-8">
          <div className="w-full max-w-[640px]">
            <div className="mb-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--obs-muted)]">
              <Sparkles size={13} /> HOMEWORK
            </div>
            <h1 className="text-3xl font-light leading-tight tracking-tight text-[var(--obs-fg)] sm:text-4xl">
              {assignment.title}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-4 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--obs-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={13} />
                Due {formatLongDate(assignment.dueDate)}
              </span>
              <span>
                {total} {total === 1 ? "problem" : "problems"}
              </span>
            </div>
            {assignment.instructions.trim() && (
              <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-[var(--obs-fg)]/85">
                {assignment.instructions}
              </p>
            )}
            <div className="mt-8">
              <SubmitterBanner />
              <button
                onClick={() => setStarted(true)}
                className="flex h-12 items-center justify-center gap-2 rounded-full border border-[var(--obs-border)] bg-[var(--obs-bg)]/30 px-8 font-mono text-xs uppercase tracking-[0.22em] text-[var(--obs-fg)] transition-colors hover:border-[var(--obs-glow-mid)] hover:bg-[var(--obs-surface)]"
              >
                Start
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </QuizShell>
    );
  }

  // ── Problem flow ────────────────────────────────────────────────────────
  return (
    <QuizShell onBack={() => setStarted(false)}>
      {/* Top-right progress strip — bar + count. */}
      <div className="pointer-events-none absolute right-8 top-3 z-20 flex w-[min(320px,44vw)] items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--obs-border)]/40">
          <div
            className="h-full rounded-full bg-[var(--obs-accent)] transition-[width] duration-300"
            style={{ width: `${(index / Math.max(1, total)) * 100}%` }}
          />
        </div>
        <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--obs-muted)]">
          Q {index + 1} / {total}
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Orb — fixed top-left corner of the column. */}
        <div className="pointer-events-none absolute left-3 top-3 z-20 flex w-[220px] flex-col items-center gap-2">
          <ObservationOrb state={orbState} size={100} />
        </div>

        {/* Canvas region — flashcard centered on the iso-contour field. */}
        <div className="relative min-h-0 flex-1">
          <IsoContourFrame bottomCenterLabel="" bottomRightLabel="">
            <div className="relative h-full w-full">
              {/* Keyed on the problem id so each navigation remounts the
                  card (enter fade replays). A single keyed child inside
                  AnimatePresence mode="wait" deadlocks on rapid prev/next
                  — the exiting card freezes on screen at its old props —
                  so we remount instead of cross-fading. */}
              <motion.div
                key={current.id}
                className="flex h-full w-full items-center justify-center overflow-y-auto px-8 py-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.18 }}
              >
                <div className="w-full max-w-[760px] space-y-6">
                    <div className="flex gap-3">
                      <span className="mt-1 font-mono text-sm text-[var(--obs-muted)]">
                        {index + 1}.
                      </span>
                      <div className="flex-1 text-lg leading-relaxed text-[var(--obs-fg)]">
                        <MathContent content={current.prompt} size="lg" />
                      </div>
                    </div>

                    {isFreeResponse ? (
                      <FreeResponseAnswer
                        value={textAnswers[index]}
                        onChange={(v) =>
                          setTextAnswers((prev) => {
                            const next = [...prev];
                            next[index] = v;
                            return next;
                          })
                        }
                        photos={photos}
                        encoding={encoding}
                        onAddPhoto={() => fileRef.current?.click()}
                        onRemovePhoto={(i) =>
                          setPhotos((prev) => prev.filter((_, j) => j !== i))
                        }
                      />
                    ) : (
                      <ChoiceAnswer
                        question={current as PublicAssignmentQuestion}
                        selected={choiceAnswers[index]}
                        onSelect={(oi) =>
                          setChoiceAnswers((prev) => {
                            const next = [...prev];
                            next[index] = oi;
                            return next;
                          })
                        }
                      />
                    )}
                </div>
              </motion.div>
            </div>
          </IsoContourFrame>
        </div>

        {/* Hidden file input for paper-work photos (free-response). */}
        {isFreeResponse && (
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={pickPhotos}
            className="hidden"
          />
        )}

        {/* Bottom control bar — prev / next-or-turn-in / audio. */}
        <div className="shrink-0 px-8 py-4">
          <div className="mx-auto flex w-full max-w-[760px] items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => goTo(index - 1)}
              disabled={index <= 0}
              aria-label="Previous problem"
              title="Previous problem"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--obs-border)] disabled:hover:text-[var(--obs-muted)]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {isLast ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submit.isPending || encoding || !canSubmit}
                className="flex h-10 items-center justify-center gap-2 rounded-full border border-[var(--obs-accent)]/60 bg-[var(--obs-accent)]/10 px-6 font-mono text-xs uppercase tracking-[0.18em] text-[var(--obs-fg)] transition-colors hover:bg-[var(--obs-accent)]/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submit.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {canSubmit
                  ? "Turn in"
                  : isFreeResponse
                    ? "Answer to turn in"
                    : `Answer ${total - answeredCount} more`}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => goTo(index + 1)}
                aria-label="Next problem"
                title="Next problem"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}

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
          </div>
          {submit.isError && (
            <p className="mt-3 text-center text-sm text-red-400">
              {submit.error instanceof Error
                ? submit.error.message
                : "Could not submit."}
            </p>
          )}
        </div>
      </div>
    </QuizShell>
  );
}

/** Dark observation chrome wrapper shared by every screen of the quiz. */
function QuizShell({
  children,
  onBack,
}: {
  children: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <div className="dark relative">
      <ObservationFrame onBack={onBack}>{children}</ObservationFrame>
    </div>
  );
}

/** Free-response answer input + optional photos of paper work. */
function FreeResponseAnswer({
  value,
  onChange,
  photos,
  encoding,
  onAddPhoto,
  onRemovePhoto,
}: {
  value: string;
  onChange: (v: string) => void;
  photos: WorkPhoto[];
  encoding: boolean;
  onAddPhoto: () => void;
  onRemovePhoto: (i: number) => void;
}) {
  return (
    <div className="space-y-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder="Type your work and answer here…"
        className="w-full resize-y rounded-lg border border-[var(--obs-border)] bg-[var(--obs-bg)]/30 p-4 text-[15px] leading-relaxed text-[var(--obs-fg)] outline-none placeholder:text-[var(--obs-muted)]/70 focus:border-[var(--obs-glow-mid)]"
      />
      <div className="flex flex-wrap items-center gap-2">
        {photos.map((p, i) => (
          <span key={i} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.previewUrl}
              alt={`Photo of your work, page ${i + 1}`}
              className="h-16 w-16 rounded-md border border-[var(--obs-border)] object-cover"
            />
            <button
              onClick={() => onRemovePhoto(i)}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--obs-border)] bg-[var(--obs-bg)] text-[var(--obs-muted)] transition-colors hover:text-[var(--obs-fg)]"
              aria-label={`Remove photo ${i + 1}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        {photos.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={onAddPhoto}
            disabled={encoding}
            className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--obs-border)] text-[var(--obs-muted)] transition-colors hover:border-[var(--obs-glow-mid)] hover:text-[var(--obs-fg)] disabled:opacity-50"
          >
            {encoding ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Camera size={15} />
            )}
            <span className="font-mono text-[8px] uppercase tracking-[0.12em]">
              Photo
            </span>
          </button>
        )}
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--obs-muted)]/80">
          Worked on paper? Add up to {MAX_PHOTOS} photos.
        </span>
      </div>
    </div>
  );
}

/** Multiple-choice answer grid. Students never see correctness here — the
 *  public projection strips the answer key — so this only conveys the
 *  current selection. */
function ChoiceAnswer({
  question,
  selected,
  onSelect,
}: {
  question: PublicAssignmentQuestion;
  selected: number;
  onSelect: (oi: number) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {question.options.map((opt, oi) => {
        const chosen = selected === oi;
        return (
          <button
            key={oi}
            type="button"
            onClick={() => onSelect(oi)}
            aria-pressed={chosen}
            className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-left text-[15px] transition-colors ${
              chosen
                ? "border-[var(--obs-accent)] bg-[var(--obs-accent)]/10 text-[var(--obs-fg)]"
                : "border-[var(--obs-border)] bg-[var(--obs-bg)]/30 text-[var(--obs-fg)]/85 hover:border-[var(--obs-glow-mid)]/60"
            }`}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${
                chosen
                  ? "border-[var(--obs-accent)] bg-[var(--obs-accent)] text-black"
                  : "border-[var(--obs-border)] text-[var(--obs-muted)]"
              }`}
            >
              {chosen ? <Check className="h-3 w-3" /> : OPTION_LETTERS[oi]}
            </span>
            <span className="flex-1 leading-relaxed">
              <MathContent content={opt} size="sm" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
