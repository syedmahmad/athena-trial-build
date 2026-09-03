type Tone = "success" | "amber" | "destructive";

function toneFor(pct: number): Tone {
  if (pct >= 0.8) return "success";
  if (pct >= 0.5) return "amber";
  return "destructive";
}

const STROKE_BY_TONE: Record<Tone, string> = {
  success: "var(--athena-success)",
  amber: "var(--athena-amber)",
  destructive: "var(--destructive)",
};

const TEXT_BY_TONE: Record<Tone, string> = {
  success: "text-athena-success",
  amber: "text-athena-amber",
  destructive: "text-destructive",
};

export function ScoreBadge({
  score,
  total,
  caption,
}: {
  score: number;
  total: number;
  caption?: string;
}) {
  const pct = total > 0 ? Math.max(0, Math.min(1, score / total)) : 0;
  const tone = toneFor(pct);
  const size = 168;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - pct);

  return (
    <div
      className="relative flex flex-col items-center"
      data-testid="score-badge"
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="oklch(0.92 0.005 90)"
          strokeWidth={stroke}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={STROKE_BY_TONE[tone]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <div className={`text-4xl font-bold tracking-tight ${TEXT_BY_TONE[tone]}`}>
          <span data-testid="score-numerals">
            {score}
            <span className="mx-1 text-2xl font-normal opacity-50">/</span>
            {total}
          </span>
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">
          {Math.round(pct * 100)}% correct
        </div>
      </div>
      {caption ? (
        <p className="mt-3 max-w-[260px] text-center text-base font-medium leading-snug text-foreground">
          {caption}
        </p>
      ) : null}
    </div>
  );
}
