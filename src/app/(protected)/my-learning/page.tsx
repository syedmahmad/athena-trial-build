"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Sparkles, Clock, Search, BookOpen } from "lucide-react";

const SUGGESTED_TOPICS = [
  "Python basics",
  "World War II",
  "Photosynthesis",
  "The French Revolution",
  "Newton's laws of motion",
  "Supply and demand",
  "Mitosis vs meiosis",
  "The water cycle",
  "Shakespeare's tragedies",
  "Climate change",
];

type TopicSummary = { id: string; title: string; createdAt: string };

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function MyLearningPage() {
  const router = useRouter();
  const { data: userData, loading: userLoading } = useCurrentUser();
  const [topic, setTopic] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const enabled = !userLoading && !!userData;

  const { data, isError } = useQuery<{ topics: TopicSummary[] }>({
    queryKey: ["my-learning-topics"],
    queryFn: () =>
      fetch("/api/my-learning/topics").then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      }),
    staleTime: 60_000,
    enabled,
  });

  useEffect(() => {
    if (isError) toast.error("Failed to load your topics");
  }, [isError]);

  async function handleSubmit(value: string) {
    const trimmed = value.trim();
    if (!trimmed || isGenerating) return;
    setIsGenerating(true);
    try {
      const res = await fetch("/api/my-learning/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: trimmed }),
      });
      if (!res.ok) throw new Error("Failed to generate");
      const { topicId } = await res.json();
      router.push(`/my-learning/${topicId}`);
    } catch {
      toast.error("Failed to generate topic. Please try again.");
      setIsGenerating(false);
    }
  }

  const topics = data?.topics ?? [];

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">

      {/* Left sidebar — previously explored */}
      <aside className="w-64 shrink-0 border-r border-border flex flex-col py-6 px-4 overflow-y-auto">
        <div className="flex items-center gap-2 mb-5 px-1">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Previously explored
          </span>
        </div>

        {topics.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1">
            Your explored topics will appear here.
          </p>
        ) : (
          <nav className="space-y-1">
            {topics.map((t) => (
              <Link key={t.id} href={`/my-learning/${t.id}`}>
                <div className="group rounded-xl px-3 py-2.5 hover:bg-muted transition-colors cursor-pointer">
                  <p className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-foreground text-foreground/80">
                    {t.title}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                    <Clock className="h-3 w-3" />
                    {timeAgo(t.createdAt)}
                  </p>
                </div>
              </Link>
            ))}
          </nav>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-6 py-14">

          {/* Hero */}
          <div className="mb-10 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-athena-amber/10 px-4 py-1.5 text-xs font-medium text-athena-amber mb-4">
              <Sparkles className="h-3.5 w-3.5" />
              Powered by Athena
            </div>
            <h1 className="text-4xl font-bold tracking-tight mb-3">
              Learn anything
            </h1>
            <p className="text-muted-foreground max-w-sm mx-auto">
              Type any topic and Athena will build you a personalised lesson,
              quiz, and micro-lesson in seconds.
            </p>
          </div>

          {/* Search box */}
          <div className="relative mb-3">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              placeholder="e.g. Photosynthesis, World War II, Python basics…"
              value={topic}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setTopic(e.target.value)
              }
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") handleSubmit(topic);
              }}
              disabled={isGenerating}
              className="w-full rounded-2xl border border-border bg-card pl-11 pr-32 py-3.5 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <Button
                onClick={() => handleSubmit(topic)}
                disabled={isGenerating || !topic.trim()}
                size="sm"
                className="rounded-xl px-4"
              >
                {isGenerating ? "Generating…" : "Explore"}
              </Button>
            </div>
          </div>

          {/* Generating state */}
          <AnimatePresence>
            {isGenerating && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mb-6 flex items-center gap-3 rounded-2xl border border-athena-amber/20 bg-athena-amber/5 px-4 py-3"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                  <Sparkles className="h-4 w-4 text-athena-amber" />
                </motion.div>
                <span className="text-sm text-muted-foreground">
                  Athena is preparing your lesson…
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Suggested topics */}
          {!isGenerating && (
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">
                Suggested topics
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_TOPICS.map((t) => (
                  <button
                    key={t}
                    onClick={() => handleSubmit(t)}
                    className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm hover:border-primary/40 hover:bg-muted transition-colors"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
