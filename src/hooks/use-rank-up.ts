"use client";

import { useEffect, useState } from "react";
import { getRank, RANKS, type Rank } from "@/lib/ranks";

const STORAGE_PREFIX = "athena-last-rank:";

// Module-level (not component state/ref) so it survives React Strict
// Mode's double effect-invocation in dev *and* a genuine remount within
// the same page load — either would otherwise let a second run compare
// the just-written localStorage value against itself and silently
// swallow the transition the first run correctly detected. This resets
// naturally on a real page load (new JS execution context), which is
// exactly the boundary that should reset it.
const checkedKeys = new Set<string>();

/** Detects a rank-up by comparing the current rank against the last one
 *  seen for this user (localStorage — durable across sessions, since rank
 *  itself never resets). Fires only on an actual upward transition, never
 *  on first-ever load (nothing to compare against yet) and never on a
 *  same-or-lower rank (a stale/slow request resolving after a newer one
 *  shouldn't replay an old celebration). */
export function useRankUp(userId: string | undefined, totalScore: number) {
  const [celebratingRank, setCelebratingRank] = useState<Rank | null>(null);

  useEffect(() => {
    if (!userId) return;
    const checkKey = `${userId}:${totalScore}`;
    if (checkedKeys.has(checkKey)) return;
    checkedKeys.add(checkKey);

    const key = STORAGE_PREFIX + userId;
    const current = getRank(totalScore);

    let stored: string | null;
    try {
      stored = window.localStorage.getItem(key);
    } catch {
      return; // storage unavailable — skip silently, not fatal
    }

    if (stored && stored !== current.name) {
      const prevIdx = RANKS.findIndex((r) => r.name === stored);
      const currIdx = RANKS.indexOf(current);
      if (currIdx > prevIdx) {
        setCelebratingRank(current);
      }
    }

    try {
      window.localStorage.setItem(key, current.name);
    } catch {
      /* best-effort */
    }
  }, [userId, totalScore]);

  return {
    celebratingRank,
    dismiss: () => setCelebratingRank(null),
  };
}
