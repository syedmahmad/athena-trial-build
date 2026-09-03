"use client";

type BattleZone = {
  name: string;
  slug: string;
  done: number;
};

export function BattleZones({ zones }: { zones: BattleZone[] }) {
  if (zones.length === 0) {
    return (
      <div className="border bg-card p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Battle Zones
        </h3>
        <p className="text-sm text-muted-foreground">
          Complete quizzes to see your progress here.
        </p>
      </div>
    );
  }

  const maxDone = Math.max(...zones.map((z) => z.done), 1);

  return (
    <div className="border bg-card p-5">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Battle Zones
      </h3>
      <div className="space-y-3">
        {zones.map((zone) => {
          const pct = Math.round((zone.done / maxDone) * 100);
          return (
            <div key={zone.slug}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium">{zone.name}</span>
                <span className="text-xs text-muted-foreground">
                  {zone.done} done
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden bg-muted rounded-full">
                <div
                  className="h-full rounded-full transition-all bg-foreground"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
