import { Shield, Sword, Swords, Crown, Flame, Star, Zap, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Rank = {
  name: string;
  threshold: number;
  weapon: string;
  icon: LucideIcon;
  emoji: string;
};

export const RANKS: Rank[] = [
  { name: "Novice", threshold: 800, weapon: "Rock of Knowledge", icon: Sword, emoji: "🪨" },
  { name: "Scout", threshold: 900, weapon: "Scouting Dagger", icon: Sword, emoji: "🗡" },
  { name: "Warrior", threshold: 1000, weapon: "Blade of Persistence", icon: Swords, emoji: "⚔" },
  { name: "Knight", threshold: 1100, weapon: "Shield of Focus", icon: Shield, emoji: "🛡" },
  { name: "Champion", threshold: 1200, weapon: "Bow of Precision", icon: Flame, emoji: "🏹" },
  { name: "Master", threshold: 1300, weapon: "Staff of Wisdom", icon: Star, emoji: "🔮" },
  { name: "Legend", threshold: 1400, weapon: "Crown of Glory", icon: Crown, emoji: "👑" },
  { name: "Dragon Slayer", threshold: 1500, weapon: "Dragon's Bane", icon: Zap, emoji: "🐉" },
  { name: "Ascended", threshold: 1600, weapon: "Celestial Glory", icon: Sparkles, emoji: "✨" },
];

export function getRank(score: number): Rank {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (score >= RANKS[i].threshold) return RANKS[i];
  }
  return RANKS[0];
}

export function getNextRank(score: number): Rank | null {
  const current = getRank(score);
  const idx = RANKS.indexOf(current);
  return idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
}

export function getRankProgress(score: number) {
  const current = getRank(score);
  const next = getNextRank(score);

  if (!next) {
    return { current, next: null, pct: 100, pointsToNext: 0 };
  }

  const range = next.threshold - current.threshold;
  const progress = score - current.threshold;
  const pct = Math.min(Math.round((progress / range) * 100), 100);

  return {
    current,
    next,
    pct,
    pointsToNext: next.threshold - score,
  };
}
