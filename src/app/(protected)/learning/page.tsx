"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Target } from "lucide-react";
import { getTopicIcon } from "@/lib/topic-icons";
import { cn } from "@/lib/utils";

type Topic = {
  id: string;
  slug: string;
  name: string;
  overview: string;
  estimatedTotalMinutes: number;
  satRelevance: { percentageOfTest: number };
  subtopics: { id: string }[];
  subject: string;
};

const SUBJECTS = [
  { key: "math", label: "Math" },
  { key: "reading-writing", label: "Reading & Writing" },
  { key: "science", label: "Science" },
  { key: "social-studies", label: "Social Studies" },
] as const;

export default function LearningPage() {
  const [activeSubject, setActiveSubject] = useState<string>("math");

  const {
    data,
    isLoading: loading,
    isError,
  } = useQuery<{ topics: Topic[] }>({
    queryKey: ["learning"],
    queryFn: () =>
      fetch("/api/learning").then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      }),
    staleTime: 10 * 60_000,
  });

  useEffect(() => {
    if (isError) toast.error("Failed to load learning data");
  }, [isError]);

  const topics = data?.topics ?? [];

  const filteredTopics = topics.filter((t) => t.subject === activeSubject);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-6">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-lg font-bold">Learning</h1>
      </div>

      <div className="mb-6 flex gap-2">
        {SUBJECTS.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSubject(s.key)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              activeSubject === s.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {filteredTopics.map((topic) => {
          const Icon = getTopicIcon(topic.slug);
          return (
            <Link key={topic.id} href={`/learning/${topic.slug}`}>
              <Card className="transition-colors hover:bg-accent/30">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold">{topic.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        {topic.subtopics.length} subtopic{topic.subtopics.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {topic.overview}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {topic.estimatedTotalMinutes} min
                    </span>
                    {topic.satRelevance.percentageOfTest > 0 && (
                      <span className="flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        {topic.satRelevance.percentageOfTest}% of SAT
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {filteredTopics.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No topics available yet for this subject.
        </p>
      )}
    </div>
  );
}
