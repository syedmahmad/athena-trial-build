import { TrendingUp } from "lucide-react";

export function SkillProgress({
  level,
  xp,
  streakCorrect,
}: {
  level: number | null;
  xp: number | null;
  streakCorrect: number | null;
}) {
  const safeLevel = level ?? 1;
  const safeXp = xp ?? 0;
  // Tier progression: levels are 1..10. Show progress within the tier
  // by mapping xp into a soft 0..1 ratio against 250 xp/level — purely
  // visual; the adaptive engine owns the real curve.
  const xpInLevel = safeXp % 250;
  const pct = Math.max(0, Math.min(1, xpInLevel / 250));

  return (
    <div className="rounded-2xl border border-border/80 bg-card p-4" data-testid="skill-progress">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Skill level</span>
          <span className="text-xl font-bold text-athena-navy">{safeLevel}</span>
          <span className="text-xs text-muted-foreground">of 10</span>
        </div>
        {streakCorrect && streakCorrect > 0 ? (
          <div className="inline-flex items-center gap-1 rounded-full bg-athena-success/10 px-2 py-0.5 text-xs font-semibold text-athena-success">
            <TrendingUp className="h-3 w-3" />
            <span>{streakCorrect} in a row</span>
          </div>
        ) : null}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-athena-amber transition-all"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {xpInLevel} / 250 XP toward level {safeLevel + 1}
      </p>
    </div>
  );
}
