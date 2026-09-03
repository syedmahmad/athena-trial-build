"use client";

import {
  CartesianGrid,
  Dot,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  Cell,
} from "recharts";

type QuizPoint = {
  index: number;
  ms: number;
  isCorrect: boolean;
};

type DotRenderProps = {
  cx?: number;
  cy?: number;
  payload?: QuizPoint;
  key?: React.Key | null;
};

// Per-point dot color depends on correctness. Recharts' `dot` prop
// passes a `DotItemDotProps` shape; we narrow to the fields we use
// and rely on structural compatibility.
function renderCorrectnessDot(props: unknown): React.ReactElement {
  const { cx, cy, payload, key } = (props as DotRenderProps) ?? {};
  if (cx == null || cy == null || !payload) return <g key={key ?? undefined} />;
  const fill = payload.isCorrect ? "var(--athena-success)" : "var(--destructive)";
  return (
    <Dot
      key={key ?? undefined}
      cx={cx}
      cy={cy}
      r={4}
      fill={fill}
      stroke="white"
      strokeWidth={1.5}
    />
  );
}

export function QuizSpeedChart({
  perQuestion,
  medianMs,
}: {
  perQuestion: { index: number; responseTimeMs: number | null; isCorrect: boolean }[];
  medianMs: number | null;
}) {
  const data: QuizPoint[] = perQuestion
    .filter((q): q is { index: number; responseTimeMs: number; isCorrect: boolean } => q.responseTimeMs != null)
    .map((q) => ({ index: q.index + 1, ms: Math.round(q.responseTimeMs / 1000), isCorrect: q.isCorrect }));

  if (data.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
        Not enough timing data
      </div>
    );
  }

  return (
    <div className="h-[180px] w-full" data-testid="speed-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="oklch(0.92 0.005 90)" strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="index"
            tick={{ fontSize: 11, fill: "oklch(0.50 0.02 260)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            unit="s"
            width={36}
            tick={{ fontSize: 11, fill: "oklch(0.50 0.02 260)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(value) => [`${value ?? 0}s`, "time"]}
            labelFormatter={(idx) => `Question ${idx}`}
          />
          {medianMs != null ? (
            <ReferenceLine
              y={Math.round(medianMs / 1000)}
              stroke="oklch(0.50 0.02 260)"
              strokeDasharray="4 4"
              label={{ value: "median", fontSize: 10, fill: "oklch(0.50 0.02 260)", position: "insideTopRight" }}
            />
          ) : null}
          <Line
            type="monotone"
            dataKey="ms"
            stroke="var(--athena-navy)"
            strokeWidth={2}
            dot={renderCorrectnessDot}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MicroLessonAttemptsChart({
  perStepAttempts,
}: {
  perStepAttempts: { stepIndex: number; wrongCount: number; kind: string }[];
}) {
  const data = perStepAttempts.map((s) => ({
    label: `Step ${s.stepIndex + 1}`,
    wrong: s.wrongCount,
    kind: s.kind,
  }));

  if (data.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
        No check-ins recorded
      </div>
    );
  }

  return (
    <div className="h-[180px] w-full" data-testid="speed-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="oklch(0.92 0.005 90)" strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "oklch(0.50 0.02 260)" }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11, fill: "oklch(0.50 0.02 260)" }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(value) => [`${value ?? 0} wrong`, "attempts"]}
          />
          <Bar dataKey="wrong" radius={[6, 6, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.wrong > 0 ? "var(--athena-amber)" : "oklch(0.92 0.005 90)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
