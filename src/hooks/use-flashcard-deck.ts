"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Flashcard, FlashcardDeckMeta } from "@/types/flashcards";

type Phase = "idle" | "streaming" | "ready" | "error";

type UseFlashcardDeckOptions = {
  topicSlug: string;
  subtopicSlug: string;
  count?: number;
  /** Skip the auto-fetch effect; consumer calls start() manually. */
  manualStart?: boolean;
};

export function useFlashcardDeck({
  topicSlug,
  subtopicSlug,
  count = 12,
  manualStart = false,
}: UseFlashcardDeckOptions) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [meta, setMeta] = useState<FlashcardDeckMeta | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState<Record<string, boolean>>({});

  const startedRef = useRef(false);
  const cardsRef = useRef<Flashcard[]>([]);
  cardsRef.current = cards;
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setPhase("streaming");
    setCards([]);
    setErrorMessage(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/agent/flashcards/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicSlug, subtopicSlug, count }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error("Stream failed");
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
          const payload = line.slice(6);
          if (payload === "[DONE]") {
            setPhase("ready");
            continue;
          }
          try {
            const parsed = JSON.parse(payload);
            if (parsed.meta) {
              setMeta(parsed.meta as FlashcardDeckMeta);
            } else if (parsed.card) {
              const card = parsed.card as Flashcard;
              setCards((prev) => [...prev, card]);
            } else if (parsed.error) {
              throw new Error(parsed.error);
            } else if (parsed.done) {
              setPhase("ready");
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
      setPhase("ready");
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Could not load deck";
      setErrorMessage(msg);
      setPhase("error");
    }
  }, [topicSlug, subtopicSlug, count]);

  useEffect(() => {
    if (!manualStart) {
      start();
    }
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const regenerateCard = useCallback(
    async (deckIndex: number) => {
      if (deckIndex < 0 || deckIndex >= cardsRef.current.length) return;
      const target = cardsRef.current[deckIndex];
      const cardKey = target.id;
      setIsRegenerating((prev) => ({ ...prev, [cardKey]: true }));

      try {
        const res = await fetch("/api/agent/flashcards/regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicSlug,
            subtopicSlug,
            excludeProblemIds: cardsRef.current.map((c) => c.problemId),
            deckIndex,
          }),
        });
        if (!res.ok) throw new Error("Regenerate failed");
        const json = (await res.json()) as { card: Flashcard };
        setCards((prev) => {
          const next = [...prev];
          next[deckIndex] = { ...json.card, id: target.id };
          return next;
        });
      } catch {
        // Non-fatal: leave the original card in place.
      } finally {
        setIsRegenerating((prev) => {
          const next = { ...prev };
          delete next[cardKey];
          return next;
        });
      }
    },
    [topicSlug, subtopicSlug]
  );

  const removeCard = useCallback((deckIndex: number) => {
    setCards((prev) => prev.filter((_, i) => i !== deckIndex));
  }, []);

  return {
    phase,
    meta,
    cards,
    errorMessage,
    isRegenerating,
    start,
    regenerateCard,
    removeCard,
  };
}
