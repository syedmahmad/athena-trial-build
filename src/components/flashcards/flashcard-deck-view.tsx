"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Printer,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useFlashcardDeck } from "@/hooks/use-flashcard-deck";
import { FlashcardCard, useFlipState } from "./flashcard-card";
import { cn } from "@/lib/utils";

type FlashcardDeckViewProps = {
  topicSlug: string;
  subtopicSlug: string;
};

export function FlashcardDeckView({
  topicSlug,
  subtopicSlug,
}: FlashcardDeckViewProps) {
  const router = useRouter();
  const {
    phase,
    meta,
    cards,
    errorMessage,
    isRegenerating,
    regenerateCard,
    removeCard,
  } = useFlashcardDeck({ topicSlug, subtopicSlug, count: 12 });

  const [currentIndex, setCurrentIndex] = useState(0);
  const { isFlipped, flip } = useFlipState(currentIndex);

  // Clamp the cursor if the deck shrinks (skip / regenerate).
  useEffect(() => {
    if (cards.length === 0) {
      setCurrentIndex(0);
    } else if (currentIndex >= cards.length) {
      setCurrentIndex(cards.length - 1);
    }
  }, [cards.length, currentIndex]);

  const currentCard = cards[currentIndex] ?? null;

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, Math.max(cards.length - 1, 0)));
  }, [cards.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  const handleSkip = useCallback(() => {
    if (!currentCard) return;
    removeCard(currentIndex);
  }, [currentCard, currentIndex, removeCard]);

  const handleRegenerate = useCallback(() => {
    if (!currentCard) return;
    void regenerateCard(currentIndex);
  }, [currentCard, currentIndex, regenerateCard]);

  // Keyboard shortcuts on the deck view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        flip();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        handleRegenerate();
      } else if (e.key === "Escape") {
        router.back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip, goNext, goPrev, handleRegenerate, router]);

  const [isPrinting, setIsPrinting] = useState(false);
  const handlePrint = useCallback(async () => {
    if (!cards.length || !meta || isPrinting) return;
    setIsPrinting(true);
    try {
      const res = await fetch("/api/reports/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicName: meta.topicName,
          subtopicName: meta.subtopicName,
          cards: cards.map((c) => ({
            problemId: c.problemId,
            difficulty: c.difficulty,
            questionText: c.front.questionText,
            options: c.front.options,
            correctLetter: c.back.correctLetter,
            explanation: c.back.explanation,
            solutionSteps: c.back.solutionSteps,
          })),
        }),
      });
      if (!res.ok) {
        const message = await res
          .json()
          .then((j) => j.error)
          .catch(() => null);
        throw new Error(message || `Failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `athena-flashcards-${meta.subtopicSlug}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Deck PDF downloaded");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not print deck";
      toast.error(msg);
    } finally {
      setIsPrinting(false);
    }
  }, [cards, meta, isPrinting]);

  const isStreaming = phase === "streaming";
  const showEmpty = phase === "ready" && cards.length === 0;
  const totalCards = cards.length;

  return (
    <div className="play-stage fixed inset-0 z-50 overflow-x-hidden overflow-y-auto">
      <div
        aria-hidden
        className="play-vignette pointer-events-none fixed inset-[-10%] z-0"
      />
      <div
        aria-hidden
        className="play-grain pointer-events-none fixed inset-0 z-[1]"
      />

      <Header
        meta={meta}
        topicSlug={topicSlug}
        subtopicSlug={subtopicSlug}
        phase={phase}
        totalCards={totalCards}
        isPrinting={isPrinting}
        onPrint={handlePrint}
        onExit={() => router.push("/dashboard")}
      />

      <div className="relative z-[2] mx-auto grid w-[min(1100px,94vw)] place-items-center px-6 py-6">
        {phase === "error" && (
          <ErrorBlock message={errorMessage} onRetry={() => router.refresh()} />
        )}

        {showEmpty && <EmptyBlock onExit={() => router.push("/dashboard")} />}

        {!showEmpty && phase !== "error" && (
          <>
            <DeckProgress
              total={totalCards}
              currentIndex={currentIndex}
              streaming={isStreaming}
            />

            <div className="relative mt-6 flex h-[420px] w-full items-center justify-center">
              <AnimatePresence mode="wait">
                {currentCard ? (
                  <motion.div
                    key={currentCard.id + "-" + currentCard.problemId}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -16 }}
                    transition={{ duration: 0.25 }}
                  >
                    <FlashcardCard
                      card={currentCard}
                      deckIndex={currentIndex}
                      totalCards={totalCards}
                      isFlipped={isFlipped}
                      isRegenerating={!!isRegenerating[currentCard.id]}
                      onFlip={flip}
                    />
                  </motion.div>
                ) : (
                  <SkeletonCard />
                )}
              </AnimatePresence>
            </div>

            <Controls
              onPrev={goPrev}
              onNext={goNext}
              onFlip={flip}
              onSkip={handleSkip}
              onRegenerate={handleRegenerate}
              disabled={!currentCard}
              canPrev={currentIndex > 0}
              canNext={currentIndex < totalCards - 1}
              isFlipped={isFlipped}
            />

            <Footnote />
          </>
        )}
      </div>
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────

function Header({
  meta,
  topicSlug,
  subtopicSlug,
  phase,
  totalCards,
  isPrinting,
  onPrint,
  onExit,
}: {
  meta: ReturnType<typeof useFlashcardDeck>["meta"];
  topicSlug: string;
  subtopicSlug: string;
  phase: ReturnType<typeof useFlashcardDeck>["phase"];
  totalCards: number;
  isPrinting: boolean;
  onPrint: () => void;
  onExit: () => void;
}) {
  const subtitle = useMemo(() => {
    if (meta?.subtopicName) return meta.subtopicName;
    return subtopicSlug.replace(/-/g, " ");
  }, [meta, subtopicSlug]);

  const supertitle = useMemo(() => {
    if (meta?.topicName) return meta.topicName;
    return topicSlug.replace(/-/g, " ");
  }, [meta, topicSlug]);

  const printDisabled = phase !== "ready" || totalCards === 0 || isPrinting;

  return (
    <div className="relative z-20 flex items-center justify-between px-8 pt-6">
      <button
        onClick={onExit}
        className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.28em] text-[var(--p-fg-mute)] transition-colors hover:text-[var(--p-fg)]"
        style={{ fontFamily: "var(--font-jetbrains-mono)" }}
      >
        <ChevronLeft className="h-4 w-4" />
        BACK
      </button>

      <div className="flex flex-col items-center text-center">
        <div
          className="font-mono text-[10px] uppercase tracking-[0.28em]"
          style={{ color: "var(--p-accent)" }}
        >
          Flashcards · {supertitle}
        </div>
        <div
          className="mt-1 text-[20px] tracking-[-0.01em]"
          style={{
            fontFamily: "var(--font-instrument-serif)",
            color: "var(--p-fg)",
          }}
        >
          {subtitle}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <HeaderButton
          onClick={onPrint}
          disabled={printDisabled}
          label={isPrinting ? "Building PDF…" : "Print deck"}
        >
          <Printer className={cn("h-3.5 w-3.5", isPrinting && "animate-pulse")} />
        </HeaderButton>
        <HeaderButton onClick={onExit} label="Close">
          <X className="h-3.5 w-3.5" />
        </HeaderButton>
      </div>
    </div>
  );
}

function HeaderButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.28em] transition-colors",
        disabled ? "cursor-not-allowed opacity-40" : "hover:text-[var(--p-fg)]"
      )}
      style={{
        color: "var(--p-fg-mute)",
        border: "1px solid var(--p-rule)",
        background: "oklch(0.05 0.005 80 / 0.55)",
      }}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

// ── Progress strip ───────────────────────────────────────────────────

function DeckProgress({
  total,
  currentIndex,
  streaming,
}: {
  total: number;
  currentIndex: number;
  streaming: boolean;
}) {
  return (
    <div
      className="flex w-full max-w-[640px] flex-col gap-2"
      style={{ fontFamily: "var(--font-jetbrains-mono)" }}
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.28em]">
        <span style={{ color: "var(--p-fg-mute)" }}>
          {total > 0 ? (
            <>
              <span style={{ color: "var(--p-fg)" }}>{currentIndex + 1}</span>{" "}
              / {total}
            </>
          ) : (
            "Generating deck…"
          )}
        </span>
        <span
          className="flex items-center gap-1.5"
          style={{ color: streaming ? "var(--p-accent)" : "var(--p-fg-faint)" }}
        >
          {streaming && (
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
              style={{ background: "var(--p-accent)" }}
            />
          )}
          {streaming ? "streaming" : "deck ready"}
        </span>
      </div>
      <div
        className="relative h-[2px] w-full overflow-hidden"
        style={{ background: "var(--p-rule)" }}
      >
        <motion.div
          className="absolute inset-y-0 left-0"
          style={{ background: "var(--p-accent)" }}
          animate={{
            width: total > 0 ? `${((currentIndex + 1) / total) * 100}%` : "0%",
          }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  );
}

// ── Controls ─────────────────────────────────────────────────────────

function Controls({
  onPrev,
  onNext,
  onFlip,
  onSkip,
  onRegenerate,
  disabled,
  canPrev,
  canNext,
  isFlipped,
}: {
  onPrev: () => void;
  onNext: () => void;
  onFlip: () => void;
  onSkip: () => void;
  onRegenerate: () => void;
  disabled: boolean;
  canPrev: boolean;
  canNext: boolean;
  isFlipped: boolean;
}) {
  return (
    <div className="mt-6 flex items-center gap-2">
      <ControlButton onClick={onPrev} disabled={disabled || !canPrev} label="←">
        <ChevronLeft className="h-3.5 w-3.5" />
        <span>Prev</span>
      </ControlButton>
      <ControlButton onClick={onFlip} disabled={disabled} primary>
        <span>{isFlipped ? "Show question" : "Show answer"}</span>
      </ControlButton>
      <ControlButton onClick={onNext} disabled={disabled || !canNext} label="→">
        <span>Next</span>
        <ChevronRight className="h-3.5 w-3.5" />
      </ControlButton>
      <span
        className="mx-3 h-4 w-px"
        style={{ background: "var(--p-rule)" }}
        aria-hidden
      />
      <ControlButton onClick={onRegenerate} disabled={disabled} label="R">
        <RefreshCw className="h-3.5 w-3.5" />
        <span>Regenerate</span>
      </ControlButton>
      <ControlButton onClick={onSkip} disabled={disabled}>
        <Trash2 className="h-3.5 w-3.5" />
        <span>Skip</span>
      </ControlButton>
    </div>
  );
}

function ControlButton({
  children,
  onClick,
  disabled,
  primary,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative flex items-center gap-1.5 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.28em] transition-colors",
        disabled ? "cursor-not-allowed opacity-40" : "hover:text-[var(--p-fg)]"
      )}
      style={{
        color: primary ? "var(--p-fg)" : "var(--p-fg-mute)",
        border: "1px solid var(--p-rule)",
        background: primary
          ? "color-mix(in oklch, var(--p-accent) 14%, transparent)"
          : "oklch(0.05 0.005 80 / 0.55)",
        borderColor: primary
          ? "color-mix(in oklch, var(--p-accent) 45%, var(--p-rule))"
          : "var(--p-rule)",
      }}
    >
      {children}
      {label && (
        <span
          className="ml-1 inline-flex h-4 min-w-4 items-center justify-center px-1 text-[9px]"
          style={{
            color: "var(--p-fg-faint)",
            border: "1px solid var(--p-fg-faint)",
          }}
        >
          {label}
        </span>
      )}
    </button>
  );
}

// ── Misc blocks ──────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="flex h-[400px] w-[640px] items-center justify-center"
      style={{
        background: "oklch(0.05 0.005 80 / 0.55)",
        border: "1px dashed var(--p-rule)",
      }}
    >
      <div
        className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.28em]"
        style={{ color: "var(--p-fg-mute)" }}
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
          style={{ background: "var(--p-accent)" }}
        />
        Waiting for first card…
      </div>
    </div>
  );
}

function EmptyBlock({ onExit }: { onExit: () => void }) {
  return (
    <div className="flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <div
        className="font-mono text-[10px] uppercase tracking-[0.28em]"
        style={{ color: "var(--p-fg-mute)" }}
      >
        No cards available
      </div>
      <div
        className="text-[20px] tracking-[-0.01em]"
        style={{
          fontFamily: "var(--font-instrument-serif)",
          color: "var(--p-fg)",
        }}
      >
        This subtopic doesn't have problems we can turn into flashcards yet.
      </div>
      <button
        type="button"
        onClick={onExit}
        className="mt-2 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.28em]"
        style={{
          color: "var(--p-fg)",
          border: "1px solid var(--p-rule)",
          background: "oklch(0.05 0.005 80 / 0.55)",
        }}
      >
        Pick another topic
      </button>
    </div>
  );
}

function ErrorBlock({
  message,
  onRetry,
}: {
  message: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <div
        className="font-mono text-[10px] uppercase tracking-[0.28em]"
        style={{ color: "var(--p-accent)" }}
      >
        Deck failed
      </div>
      <div
        className="text-[18px]"
        style={{
          fontFamily: "var(--font-instrument-serif)",
          color: "var(--p-fg)",
        }}
      >
        {message ?? "Could not load this deck."}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.28em]"
        style={{
          color: "var(--p-fg)",
          border: "1px solid var(--p-rule)",
          background: "oklch(0.05 0.005 80 / 0.55)",
        }}
      >
        Retry
      </button>
    </div>
  );
}

function Footnote() {
  return (
    <div
      className="mt-6 flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.28em]"
      style={{ color: "var(--p-fg-faint)" }}
    >
      <span>← → navigate</span>
      <span>space · flip</span>
      <span>R · regenerate</span>
      <span>esc · close</span>
    </div>
  );
}
