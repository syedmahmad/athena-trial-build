"use client";

import { motion } from "framer-motion";
import { getBadgeStatus, type BadgeStats } from "@/lib/badges";
import { cn } from "@/lib/utils";

/** Badge case — a second recognition axis alongside Rank (score) and
 *  Level (XP): streaks and session volume, so effort gets acknowledged
 *  from more than one number. Computed fresh from existing stats every
 *  render, same as the rank/weapon unlock row this visually echoes. */
export function TrophyCase({ stats }: { stats: BadgeStats }) {
  const badges = getBadgeStatus(stats);
  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="border bg-card p-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          Trophies
        </h2>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {earnedCount}/{badges.length}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-3">
        {badges.map((badge) => {
          const Icon = badge.icon;
          return (
            <div
              key={badge.id}
              className="group relative flex flex-col items-center gap-1.5"
            >
              <div
                className={cn(
                  "flex h-11 w-11 items-center justify-center transition-opacity",
                  badge.earned
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground/30"
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <span
                className={cn(
                  "text-center text-[9px] font-medium leading-tight",
                  badge.earned ? "text-foreground" : "text-muted-foreground/50"
                )}
              >
                {badge.name}
              </span>

              {/* Tooltip — description + status, shown on hover */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-[160px] -translate-x-1/2 rounded bg-popover px-2.5 py-1.5 text-center text-[11px] text-popover-foreground opacity-0 shadow-md ring-1 ring-border transition-opacity group-hover:opacity-100">
                <p className="font-medium">{badge.name}</p>
                <p className="text-muted-foreground">
                  {badge.earned ? "Earned — " : "Locked — "}
                  {badge.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
