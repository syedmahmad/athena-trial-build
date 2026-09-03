import { Footprints } from "lucide-react";

export function NextStepCard({ suggestion }: { suggestion: string }) {
  return (
    <aside
      data-testid="next-step"
      className="flex items-start gap-4 rounded-2xl border border-athena-navy/10 bg-athena-navy/5 p-5"
    >
      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-athena-navy text-athena-amber">
        <Footprints className="h-6 w-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-athena-navy/70">
          Next step
        </p>
        <p className="mt-1 text-base font-medium leading-snug text-foreground">
          {suggestion}
        </p>
      </div>
    </aside>
  );
}
