"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { ProgressHeader } from "@/components/progress/progress-header";
import { SectionScores } from "@/components/progress/section-scores";
import { SatSkills } from "@/components/progress/sat-skills";
import { CompositeScore } from "@/components/progress/composite-score";
import { ScoreHistory } from "@/components/progress/score-history";
import { StudyStats } from "@/components/progress/study-stats";
import { TopicMastery } from "@/components/progress/topic-mastery";
import { PracticeTestResults } from "@/components/progress/practice-test-results";
import { JourneyRanks } from "@/components/progress/journey-ranks";

type ProgressData = {
  user: {
    displayName: string | null;
    avatarUrl: string | null;
    targetScore: number | null;
    skillScore: number | null;
  };
  targetScore: number | null;
  scoreHistory: { date: string; score: number }[];
  accuracyByDifficulty: {
    difficulty: string;
    total: number;
    correct: number;
    accuracy: number;
  }[];
  topicPerformance: {
    name: string;
    slug: string;
    subject: string;
    total: number;
    correct: number;
    accuracy: number;
  }[];
  recentSessions: {
    id: string;
    subtopicName: string;
    score: number;
    totalQuestions: number;
    timeElapsedSeconds: number;
    date: string;
  }[];
  overallStats: {
    totalQuestions: number;
    accuracy: number;
    totalTimeSeconds: number;
    sessionCount: number;
    avgScore: number;
  };
  sectionScores: {
    readingWriting: {
      subject: string;
      total: number;
      correct: number;
      accuracy: number;
      scaledScore: number;
    };
    math: {
      subject: string;
      total: number;
      correct: number;
      accuracy: number;
      scaledScore: number;
    };
  };
  topicMastery: {
    items: {
      name: string;
      mastered: boolean;
      attempted: boolean;
    }[];
    masteredCount: number;
    totalCount: number;
  };
};

const staggerContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

/** SAT sections — the /sat surface scopes skills + mastery to these. */
const SAT_SUBJECTS = new Set(["math", "reading-writing"]);

export function ProgressView({ satOnly = false }: { satOnly?: boolean }) {
  const {
    data,
    isLoading: loading,
    isError,
  } = useQuery<ProgressData>({
    queryKey: ["progress"],
    queryFn: () =>
      fetch("/api/progress").then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      }),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isError) toast.error("Failed to load progress data");
  }, [isError]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="h-16 w-72 bg-muted animate-pulse" />
        <div className="mt-8 space-y-6">
          <div className="h-40 bg-muted animate-pulse" />
          <div className="h-32 bg-muted animate-pulse" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="h-64 bg-muted animate-pulse lg:col-span-3" />
            <div className="h-64 bg-muted animate-pulse lg:col-span-2" />
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const compositeScore =
    data.sectionScores.readingWriting.scaledScore +
    data.sectionScores.math.scaledScore;
  const targetScore = data.user.targetScore ?? data.targetScore ?? 1400;

  // SAT surface: keep the skills + mastery panels to the two SAT sections.
  const topicPerformance = satOnly
    ? data.topicPerformance.filter((t) => SAT_SUBJECTS.has(t.subject))
    : data.topicPerformance;
  const satTopicNames = new Set(topicPerformance.map((t) => t.name));
  const topicMastery = satOnly
    ? (() => {
        const items = data.topicMastery.items.filter((i) =>
          satTopicNames.has(i.name)
        );
        return {
          items,
          masteredCount: items.filter((i) => i.mastered).length,
          totalCount: items.length,
        };
      })()
    : data.topicMastery;

  return (
    <div className="p-6 pb-16">
      <motion.div
        className="mx-auto max-w-5xl"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {/* Header */}
        <motion.div variants={staggerItem}>
          <ProgressHeader
            subtitle={
              satOnly ? "Reading & Writing + Math" : "Across your subjects"
            }
          />
        </motion.div>

        {/* Section Scores + SAT Skills row */}
        <motion.div variants={staggerItem}>
          <h2 className="mt-8 mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Section Scores
          </h2>
        </motion.div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <motion.div className="lg:col-span-3 gap-6 grid" variants={staggerItem}>
            <SectionScores
              rw={data.sectionScores.readingWriting}
              math={data.sectionScores.math}
              targetScore={targetScore}
            />

            <CompositeScore
              score={compositeScore}
              targetScore={targetScore}
            />
          </motion.div>
          <motion.div className="lg:col-span-2" variants={staggerItem}>
            <SatSkills topics={topicPerformance} />
          </motion.div>
        </div>


        {/* Score History + Study Stats / Topic Mastery */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
          <motion.div className="lg:col-span-3" variants={staggerItem}>
            <ScoreHistory data={data.scoreHistory} />
          </motion.div>
          <motion.div className="lg:col-span-2 space-y-6" variants={staggerItem}>
            <StudyStats stats={data.overallStats} />
            <TopicMastery mastery={topicMastery} />
          </motion.div>
        </div>

        {/* Practice Test Results */}
        <motion.div className="mt-6" variants={staggerItem}>
          <PracticeTestResults sessions={data.recentSessions} />
        </motion.div>

        {/* Journey */}
        <motion.div className="mt-6" variants={staggerItem}>
          <JourneyRanks
            currentScore={compositeScore}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}

export default function ProgressPage() {
  return <ProgressView />;
}
