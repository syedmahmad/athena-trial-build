"use client";

import { Clock, Target } from "lucide-react";
import { getTopicIcon } from "@/lib/topic-icons";

type TopicHeaderProps = {
  slug: string;
  name: string;
  overview: string;
  estimatedTotalMinutes: number;
  satRelevance: { percentageOfTest: number; description: string };
  difficultyDistribution: { easy: number; medium: number; hard: number };
};

export function TopicHeader({ topic }: { topic: TopicHeaderProps }) {
  const Icon = getTopicIcon(topic.slug);
  const total =
    topic.difficultyDistribution.easy +
    topic.difficultyDistribution.medium +
    topic.difficultyDistribution.hard;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-5 w-5 text-foreground" />
        </div>
        <h1 className="text-2xl font-bold">{topic.name}</h1>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {topic.overview}
      </p>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>{topic.estimatedTotalMinutes} min total</span>
        </div>
        {topic.satRelevance.percentageOfTest > 0 && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Target className="h-4 w-4" />
            <span>{topic.satRelevance.percentageOfTest}% of SAT</span>
          </div>
        )}
        {total > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="flex h-2 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className="bg-green-500"
                style={{ width: `${(topic.difficultyDistribution.easy / total) * 100}%` }}
              />
              <div
                className="bg-amber-500"
                style={{ width: `${(topic.difficultyDistribution.medium / total) * 100}%` }}
              />
              <div
                className="bg-red-500"
                style={{ width: `${(topic.difficultyDistribution.hard / total) * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">difficulty</span>
          </div>
        )}
      </div>
    </div>
  );
}
