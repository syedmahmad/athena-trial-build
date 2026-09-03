"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, Headphones, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Subtopic = {
  id: string;
  slug: string;
  name: string;
};

type Topic = {
  id: string;
  slug: string;
  name: string;
  subject: string;
  subtopics: Subtopic[];
};

type LearningResponse = {
  topics: Topic[];
};

export function PodcastTopicPickerModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (subtopicId: string) => void;
}) {
  return (
    <AnimatePresence>
      {open ? <ModalContents onClose={onClose} onPick={onPick} /> : null}
    </AnimatePresence>
  );
}

function ModalContents({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (subtopicId: string) => void;
}) {
  // expandedTopicId lives here so it auto-resets every time the modal
  // mounts (i.e. every time the picker opens). Hoisting it to the outer
  // component would require a setState-in-effect dance to reset.
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<LearningResponse>({
    queryKey: ["learning"],
    queryFn: () =>
      fetch("/api/learning").then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      }),
    staleTime: 10 * 60_000,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const topics = useMemo(() => data?.topics ?? [], [data]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        className="relative mx-4 flex w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
        style={{ maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div
            className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-muted-foreground"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            <Headphones className="h-3.5 w-3.5" />
            Pick a topic
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading topics…
            </div>
          ) : isError ? (
            <div className="py-12 text-center text-sm text-red-500">
              Failed to load topics.
            </div>
          ) : topics.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No topics available.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {topics.map((topic) => {
                const isOpen = expandedTopicId === topic.id;
                return (
                  <div
                    key={topic.id}
                    className="overflow-hidden rounded-md border border-border bg-card/40"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedTopicId(isOpen ? null : topic.id)
                      }
                      className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40"
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span
                          className="truncate text-sm"
                          style={{
                            fontFamily: "var(--font-instrument-serif)",
                            fontWeight: 400,
                          }}
                        >
                          {topic.name}
                        </span>
                        <span
                          className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
                          style={{
                            fontFamily: "var(--font-jetbrains-mono)",
                          }}
                        >
                          {topic.subtopics.length} subtopic
                          {topic.subtopics.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          isOpen && "rotate-90",
                        )}
                      />
                    </button>
                    {isOpen ? (
                      <div className="flex flex-col border-t border-border">
                        {topic.subtopics.map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => {
                              onPick(st.id);
                              onClose();
                            }}
                            className="flex items-center justify-between gap-3 px-5 py-2 text-left transition-colors hover:bg-muted/50"
                          >
                            <span
                              className="truncate text-sm"
                              style={{
                                fontFamily: "var(--font-jetbrains-mono)",
                              }}
                            >
                              {st.name}
                            </span>
                            <Headphones className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
