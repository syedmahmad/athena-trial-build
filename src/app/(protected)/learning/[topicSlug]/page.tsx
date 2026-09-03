"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { TopicSidebar } from "@/components/learning/topic-sidebar";
import { TopicHeader } from "@/components/learning/topic-header";
import { SubtopicCard } from "@/components/learning/subtopic-card";

type Subtopic = {
  id: string;
  slug: string;
  name: string;
  difficulty: string;
  estimatedMinutes: number;
  description: string;
};

type Topic = {
  id: string;
  slug: string;
  name: string;
  subject: string;
  overview: string;
  estimatedTotalMinutes: number;
  satRelevance: { percentageOfTest: number; description: string };
  difficultyDistribution: { easy: number; medium: number; hard: number };
  subtopics: Subtopic[];
};

export default function TopicPage() {
  const params = useParams<{ topicSlug: string }>();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/learning");
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setTopics(data.topics);
      } catch {
        toast.error("Failed to load learning data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const activeTopic = topics.find((t) => t.slug === params.topicSlug) ?? topics[0];

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-6">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        </div>
        <div className="flex gap-6">
          <div className="w-56 shrink-0 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
          <div className="flex-1 space-y-4">
            <div className="h-24 bg-muted rounded-lg animate-pulse" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 bg-muted rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!activeTopic) return null;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-lg font-bold">Learning</h1>
      </div>
          <div className="flex gap-6">
            <TopicSidebar
              topics={topics}
              activeSlug={activeTopic.slug}
            />
            <div className="flex-1 min-w-0 space-y-6">
              <TopicHeader topic={activeTopic} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {activeTopic.subtopics.map((st) => (
                  <SubtopicCard
                    key={st.id}
                    subtopic={st}
                    topicSlug={activeTopic.slug}
                  />
                ))}
              </div>
              {activeTopic.subtopics.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No subtopics available for this topic yet.
                </p>
              )}
            </div>
          </div>
    </div>
  );
}
