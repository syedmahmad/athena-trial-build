"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/use-current-user";
import { WelcomeHeader } from "@/components/dashboard/welcome-header";
import { RankCard } from "@/components/dashboard/rank-card";
import { DailyStudyReminder } from "@/components/dashboard/daily-study-reminder";
import { DailyQuestCard } from "@/components/dashboard/daily-quest-card";
import { QuestStreak } from "@/components/dashboard/quest-streak";
import { BattleZones } from "@/components/dashboard/battle-zones";
import { CompanionCard } from "@/components/dashboard/companion-card";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { FriendsLeaderboard } from "@/components/dashboard/friends-leaderboard";
import { FullSatCard } from "@/components/dashboard/full-sat-card";
import { RankUpCelebration } from "@/components/dashboard/rank-up-celebration";
import { TrophyCase } from "@/components/dashboard/trophy-case";
import { ChallengesCard } from "@/components/dashboard/challenges-card";
import { useRankUp } from "@/hooks/use-rank-up";
import { ParticlesBackground } from "@/components/particles-background";

type StreakDay = {
  day: string;
  completed: boolean;
  isPast: boolean;
};

type BattleZone = {
  name: string;
  slug: string;
  done: number;
};

type FriendScore = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  totalScore: number;
  weeklyDelta: number;
};

type DashboardData = {
  user: {
    id: string;
    displayName: string | null;
    skillScore: number | null;
    avatarUrl: string | null;
    targetScore: number | null;
    totalXp: number;
    bestStreak: number;
    streakFreezeAvailable: boolean;
  };
  upcomingSessions: unknown[];
  queueItems: unknown[];
  totalQueueCount: number;
  completedLessonCount: number;
  completedSessions: number;
  totalSessions: number;
  streak: number;
  totalScore: number;
  weeklyDelta: number;
  topics: { slug: string; name: string; subtopicCount: number }[];
  weeklyStreakDays: StreakDay[];
  battleZones: BattleZone[];
  todayStudyTime: string | null;
  targetScore: number | null;
  friendsScores: FriendScore[];
};

const staggerContainer = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function DashboardPage() {
  const router = useRouter();
  const { data: userData, loading: userLoading } = useCurrentUser();

  const readyToLoad =
    !userLoading && !!userData && userData.user.onboardingCompleted;

  const {
    data,
    isLoading: dashLoading,
    isError,
  } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () =>
      fetch("/api/dashboard").then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      }),
    staleTime: 60_000,
    enabled: readyToLoad,
  });

  useEffect(() => {
    if (!userLoading && userData && !userData.user.onboardingCompleted) {
      router.replace("/sat/onboarding");
    }
  }, [userData, userLoading, router]);

  useEffect(() => {
    if (isError) toast.error("Failed to load dashboard data");
  }, [isError]);

  const loading = userLoading || dashLoading;

  // Called unconditionally (before the loading/data early-returns) per the
  // rules of hooks — data?.totalScore defaults to 0 until it loads, which
  // getRank() resolves to the base rank, so the pre-load render can never
  // spuriously look like a rank-up once real data arrives.
  const { celebratingRank, dismiss } = useRankUp(
    data?.user.id,
    data?.totalScore ?? 0
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="h-8 w-64 bg-muted rounded animate-pulse" />
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            <div className="h-40 bg-muted animate-pulse" />
            <div className="h-56 bg-muted animate-pulse" />
            <div className="h-24 bg-muted animate-pulse" />
          </div>
          <div className="space-y-6 lg:col-span-2">
            <div className="h-24 bg-muted animate-pulse" />
            <div className="h-32 bg-muted animate-pulse" />
            <div className="h-48 bg-muted animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="relative">
      <RankUpCelebration rank={celebratingRank} onDismiss={dismiss} />
      <ParticlesBackground />
      <div className="relative z-10 p-6">
        <motion.div
          className="mx-auto max-w-6xl"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          {/* Welcome Header */}
          <motion.div variants={staggerItem}>
            <WelcomeHeader
              displayName={data.user.displayName}
              avatarUrl={data.user.avatarUrl}
            />
          </motion.div>

          {/* Two-column layout */}
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-5">
            {/* Left column (main) */}
            <motion.div
              className="space-y-5 lg:col-span-3"
              variants={staggerContainer}
              initial="hidden"
              animate="show"
            >
              <motion.div variants={staggerItem}>
                <RankCard
                  totalScore={data.totalScore}
                  weeklyDelta={data.weeklyDelta}
                  totalXp={data.user.totalXp}
                />
              </motion.div>

              <motion.div variants={staggerItem}>
                <DailyStudyReminder time={data.todayStudyTime} />
              </motion.div>

              <motion.div variants={staggerItem}>
                <DailyQuestCard />
              </motion.div>

              <motion.div variants={staggerItem}>
                <FullSatCard />
              </motion.div>

              <motion.div variants={staggerItem}>
                <QuestStreak
                  streak={data.streak}
                  days={data.weeklyStreakDays}
                  freezeAvailable={data.user.streakFreezeAvailable}
                />
              </motion.div>

              <motion.div variants={staggerItem}>
                <BattleZones zones={data.battleZones} />
              </motion.div>
            </motion.div>

            {/* Right column (sidebar) */}
            <motion.div
              className="space-y-5 lg:col-span-2"
              variants={staggerContainer}
              initial="hidden"
              animate="show"
            >
              <motion.div variants={staggerItem}>
                <CompanionCard />
              </motion.div>

              <motion.div variants={staggerItem}>
                <StatsCards
                  targetScore={data.user.targetScore ?? data.targetScore}
                  sessionsCount={data.completedSessions}
                />
              </motion.div>

              <motion.div variants={staggerItem}>
                <TrophyCase
                  stats={{
                    totalXp: data.user.totalXp,
                    bestStreak: data.user.bestStreak,
                    completedSessions: data.completedSessions,
                  }}
                />
              </motion.div>

              <motion.div variants={staggerItem}>
                <FriendsLeaderboard friends={data.friendsScores} />
              </motion.div>

              <motion.div variants={staggerItem}>
                <ChallengesCard />
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
