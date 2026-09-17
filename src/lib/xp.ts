/** Global XP → Level curve. Each level costs more than the last (a
 *  standard RPG progression) — level 1→2 costs 100 XP, and each
 *  subsequent level costs 40 XP more than the one before it.
 *
 *  `total_xp` is already computed and persisted server-side on every
 *  quiz / daily quest / full-SAT submit (see sat-quiz/submit,
 *  daily-quest/answer, full-sat/submit routes) — this is a pure
 *  display-layer mapping, no new backend state.
 */

const BASE_XP_FOR_LEVEL = 100;
const XP_STEP_PER_LEVEL = 40;

export function xpRequiredForLevel(level: number): number {
  // XP needed to go from `level` to `level + 1`.
  return BASE_XP_FOR_LEVEL + (level - 1) * XP_STEP_PER_LEVEL;
}

/** Cosmetic level tiers — the first functional payoff for leveling up.
 *  Purely a display-layer re-skin of the Lvl badge (color only, no gated
 *  content), same spirit as the existing rank/weapon system: a reason to
 *  notice the number changed, not a new reward pipeline. Uses only
 *  existing design tokens (no new colors introduced). */
export type LevelTier = {
  name: string;
  minLevel: number;
  colorVar: string;
};

export const LEVEL_TIERS: LevelTier[] = [
  { name: "Bronze", minLevel: 1, colorVar: "--muted-foreground" },
  { name: "Silver", minLevel: 4, colorVar: "--chart-4" },
  { name: "Gold", minLevel: 8, colorVar: "--athena-amber" },
  { name: "Diamond", minLevel: 14, colorVar: "--primary" },
];

export function getLevelTier(level: number): LevelTier {
  let tier = LEVEL_TIERS[0];
  for (const t of LEVEL_TIERS) {
    if (level >= t.minLevel) tier = t;
  }
  return tier;
}

export function getLevelProgress(totalXp: number) {
  let level = 1;
  let xpAtLevelStart = 0;
  let xpForThisLevel = xpRequiredForLevel(level);

  while (totalXp >= xpAtLevelStart + xpForThisLevel) {
    xpAtLevelStart += xpForThisLevel;
    level += 1;
    xpForThisLevel = xpRequiredForLevel(level);
  }

  const xpIntoLevel = totalXp - xpAtLevelStart;
  const pct = Math.min(
    100,
    Math.round((xpIntoLevel / xpForThisLevel) * 100)
  );

  return {
    level,
    xpIntoLevel,
    xpForThisLevel,
    pct,
  };
}
