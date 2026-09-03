"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

type ScorePoint = {
  date: string;
  score: number;
};

export function ScoreHistory({ data }: { data: ScorePoint[] }) {
  if (data.length === 0) {
    return (
      <div className="border bg-muted/30 p-6 h-full">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Score History
        </h2>
        <p className="mt-6 text-sm text-muted-foreground">
          Complete quizzes to see your score history.
        </p>
      </div>
    );
  }

  // Group by week, label as W1, W2, etc.
  const firstDate = new Date(data[0].date);
  const weekMap = new Map<number, number>();

  for (const point of data) {
    const d = new Date(point.date);
    const weekNum = Math.floor(
      (d.getTime() - firstDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
    weekMap.set(weekNum, point.score);
  }

  const maxWeek = Math.max(...weekMap.keys(), 0);
  const chartData: { week: string; score: number }[] = [];
  for (let i = 0; i <= maxWeek; i++) {
    chartData.push({
      week: `W${i + 1}`,
      score: weekMap.get(i) ?? (i > 0 ? chartData[i - 1]?.score ?? 0 : 0),
    });
  }

  // Fallback if only one point
  if (chartData.length === 0) {
    chartData.push({ week: "W1", score: data[data.length - 1].score });
  }

  const firstScore = chartData[0]?.score ?? 0;
  const lastScore = chartData[chartData.length - 1]?.score ?? 0;
  const delta = lastScore - firstScore;

  return (
    <div className="border bg-muted/30 p-6 h-full flex flex-col">
      <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Score History
      </h2>
      <div className="flex-1 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis
              dataKey="week"
              tick={{ fontSize: 11 }}
              stroke="hsl(var(--muted-foreground))"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              stroke="hsl(var(--muted-foreground))"
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke="hsl(var(--foreground))"
              strokeWidth={2}
              dot={{
                r: 5,
                fill: "hsl(var(--background))",
                stroke: "hsl(var(--foreground))",
                strokeWidth: 2,
              }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {delta > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          +{delta} points since start
        </p>
      )}
    </div>
  );
}
