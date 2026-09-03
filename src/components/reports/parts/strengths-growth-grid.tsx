import { Compass, ShieldCheck } from "lucide-react";
import type { ReportChip } from "@/lib/reports/types";
import { ReportIconView } from "./icon-map";

type Tone = "success" | "amber";

function Chip({ chip, tone }: { chip: ReportChip; tone: Tone }) {
  const ringClass =
    tone === "success"
      ? "bg-athena-success/10 text-athena-success"
      : "bg-athena-amber/10 text-athena-amber";

  return (
    <li
      data-chip
      className="flex items-start gap-3 rounded-2xl border border-border/80 bg-card px-4 py-3"
    >
      <span
        className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ringClass}`}
      >
        <ReportIconView name={chip.icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-foreground">
          {chip.label}
        </p>
        {chip.detail ? (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {chip.detail}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function StrengthsGrowthGrid({
  strengths,
  growthAreas,
}: {
  strengths: ReportChip[];
  growthAreas: ReportChip[];
}) {
  return (
    <div className="grid grid-cols-2 gap-6">
      <section data-testid="strengths">
        <header className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-athena-success" />
          <h3 className="text-sm font-semibold uppercase tracking-widest text-foreground">
            What you&rsquo;ve got
          </h3>
        </header>
        <ul className="flex flex-col gap-2">
          {strengths.map((chip, i) => (
            <Chip key={`s-${i}`} chip={chip} tone="success" />
          ))}
        </ul>
      </section>
      <section data-testid="growth">
        <header className="mb-3 flex items-center gap-2">
          <Compass className="h-5 w-5 text-athena-amber" />
          <h3 className="text-sm font-semibold uppercase tracking-widest text-foreground">
            Where to grow
          </h3>
        </header>
        <ul className="flex flex-col gap-2">
          {growthAreas.map((chip, i) => (
            <Chip key={`g-${i}`} chip={chip} tone="amber" />
          ))}
        </ul>
      </section>
    </div>
  );
}
