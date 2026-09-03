"use client";

type Session = {
  id: string;
  subtopicName: string;
  score: number;
  totalQuestions: number;
  timeElapsedSeconds: number;
  date: string;
};

export function PracticeTestResults({
  sessions,
}: {
  sessions: Session[];
}) {
  if (sessions.length === 0) {
    return (
      <div className="border bg-card p-5">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Practice Test Results
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          No practice sessions yet.
        </p>
      </div>
    );
  }

  const displayed = sessions.slice(0, 5);

  return (
    <div className="border bg-card p-5">
      <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Practice Test Results
      </h2>
      <div className="space-y-0">
        {displayed.map((session, idx) => {
          const date = new Date(session.date);
          const dateStr = date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
          const pct =
            session.totalQuestions > 0
              ? Math.round(
                  (session.score / session.totalQuestions) * 100
                )
              : 0;

          return (
            <div
              key={session.id}
              className="flex items-center justify-between border-b border-border/40 py-3.5 last:border-0"
            >
              <div>
                <p className="text-sm font-bold">Session {idx + 1}</p>
                <p className="text-xs text-muted-foreground">
                  {dateStr} &middot; {session.subtopicName}
                </p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold tabular-nums">
                  {session.score}/{session.totalQuestions}
                </span>
                <p className="text-xs text-muted-foreground">{pct}%</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
