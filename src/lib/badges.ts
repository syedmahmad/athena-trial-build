import type { LucideIcon } from "lucide-react";
import { Zap, Flame, Target } from "lucide-react";

/** Badge criteria are pure functions over stats the dashboard already
 *  fetches (total_xp, best_streak, completed sessions) — same pattern as
 *  the existing rank/tier system: no new "achievements" table, no new
 *  writes. A badge is "earned" any time its criterion is currently true,
 *  computed fresh on every load rather than tracked as a one-time event.
 *  Three categories deliberately orthogonal to Rank (score-based) and
 *  Level (XP-based) so they recognize different kinds of effort rather
 *  than re-badging the same number. */
export type BadgeCategory = "xp" | "streak" | "volume";

export type Badge = {
  id: string;
  name: string;
  category: BadgeCategory;
  icon: LucideIcon;
  threshold: number;
  description: string;
};

export const BADGES: Badge[] = [
  // XP — fast-moving, ticks up every session
  { id: "xp-50", name: "First Blood", category: "xp", icon: Zap, threshold: 50, description: "Earn 50 XP" },
  { id: "xp-250", name: "Warming Up", category: "xp", icon: Zap, threshold: 250, description: "Earn 250 XP" },
  { id: "xp-750", name: "On Fire", category: "xp", icon: Zap, threshold: 750, description: "Earn 750 XP" },
  { id: "xp-2000", name: "XP Legend", category: "xp", icon: Zap, threshold: 2000, description: "Earn 2,000 XP" },

  // Streak — best-ever streak, so it stays earned even after a streak breaks
  { id: "streak-3", name: "3-Day Streak", category: "streak", icon: Flame, threshold: 3, description: "Hit a 3-day streak" },
  { id: "streak-7", name: "Week Warrior", category: "streak", icon: Flame, threshold: 7, description: "Hit a 7-day streak" },
  { id: "streak-30", name: "Unstoppable", category: "streak", icon: Flame, threshold: 30, description: "Hit a 30-day streak" },

  // Volume — completed study sessions
  { id: "sessions-1", name: "First Steps", category: "volume", icon: Target, threshold: 1, description: "Complete 1 session" },
  { id: "sessions-10", name: "Dedicated", category: "volume", icon: Target, threshold: 10, description: "Complete 10 sessions" },
  { id: "sessions-50", name: "Marathoner", category: "volume", icon: Target, threshold: 50, description: "Complete 50 sessions" },
];

export type BadgeStats = {
  totalXp: number;
  bestStreak: number;
  completedSessions: number;
};

function statFor(category: BadgeCategory, stats: BadgeStats): number {
  switch (category) {
    case "xp":
      return stats.totalXp;
    case "streak":
      return stats.bestStreak;
    case "volume":
      return stats.completedSessions;
  }
}

export function getBadgeStatus(stats: BadgeStats) {
  return BADGES.map((badge) => ({
    ...badge,
    earned: statFor(badge.category, stats) >= badge.threshold,
  }));
}
