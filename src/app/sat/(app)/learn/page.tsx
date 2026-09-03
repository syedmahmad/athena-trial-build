"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Dumbbell, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Subtopic = {
  id: string;
  slug: string;
  name: string;
  difficulty: string | null;
  estimatedMinutes: number | null;
  description: string | null;
  completed: boolean;
};

type Topic = {
  id: string;
  slug: string;
  name: string;
  subject: string;
  overview: string | null;
  subtopics: Subtopic[];
};

// The SAT surface only teaches the two SAT sections. Science and
// social-studies stay on the main app.
const SAT_SUBJECTS: { key: string; label: string }[] = [
  { key: "math", label: "Math" },
  { key: "reading-writing", label: "Reading & Writing" },
];

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function SatLearnPage() {
  const [subject, setSubject] = useState<string>("math");
  const [openTopicId, setOpenTopicId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<{ topics: Topic[] }>({
    queryKey: ["learning"],
    queryFn: () =>
      fetch("/api/learning").then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      }),
    staleTime: 600_000,
  });

  useEffect(() => {
    if (isError) toast.error("Failed to load topics");
  }, [isError]);

  const topics = (data?.topics ?? []).filter((t) => t.subject === subject);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold tracking-tight">Learn</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick a skill — take the lesson, then prove it with practice.
      </p>

      {/* Section toggle */}
      <div className="mt-6 flex gap-2">
        {SAT_SUBJECTS.map((s) => (
          <button
            key={s.key}
            onClick={() => {
              setSubject(s.key);
              setOpenTopicId(null);
            }}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              subject === s.key
                ? "sat-accent-bg border-transparent text-white"
                : "bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="mt-8 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : (
        <motion.div
          className="mt-8 space-y-3"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          key={subject}
        >
          {topics.map((topic) => {
            const open = openTopicId === topic.id;
            const done = topic.subtopics.filter((s) => s.completed).length;
            return (
              <motion.div
                key={topic.id}
                variants={staggerItem}
                className="overflow-hidden rounded-xl border bg-card"
              >
                <button
                  onClick={() => setOpenTopicId(open ? null : topic.id)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left"
                >
                  <div>
                    <h2 className="font-semibold">{topic.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {done}/{topic.subtopics.length} skills completed
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      open && "rotate-180"
                    )}
                  />
                </button>
                {open && (
                  <ul className="border-t">
                    {topic.subtopics.map((sub) => (
                      <li
                        key={sub.id}
                        className="flex items-center justify-between gap-4 border-b px-5 py-3 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {sub.name}
                            {sub.completed && (
                              <span className="sat-accent-text ml-2 text-xs">
                                done
                              </span>
                            )}
                          </p>
                          {sub.estimatedMinutes ? (
                            <p className="text-xs text-muted-foreground">
                              ~{sub.estimatedMinutes} min
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Link
                            href={`/learning/${topic.slug}/${sub.slug}/micro-lesson?sat=1`}
                            className="sat-accent-pill flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
                          >
                            <BookOpen className="h-3.5 w-3.5" />
                            Lesson
                          </Link>
                          <Link
                            href={`/learning/${topic.slug}/${sub.slug}/quiz/1?sat=1`}
                            className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                          >
                            <Dumbbell className="h-3.5 w-3.5" />
                            Practice
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            );
          })}
          {topics.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No topics available yet.
            </p>
          )}
        </motion.div>
      )}
    </div>
  );
}
