"use client";

import { BookOpen, CheckCircle2, MessageSquare } from "lucide-react";
import type { CachedReportPayload } from "@/lib/reports/types";
import { ReportFrame } from "./report-frame";
import { ReportHeader } from "./parts/report-header";
import { ScoreBadge } from "./parts/score-badge";
import { ScoreContextStrip } from "./parts/score-context-strip";
import { StrengthsGrowthGrid } from "./parts/strengths-growth-grid";
import { SpeedInsight } from "./parts/speed-insight";
import { MicroLessonAttemptsChart } from "./parts/speed-timeline";
import { SkillProgress } from "./parts/skill-progress";
import { NextStepCard } from "./parts/next-step-card";
import { ReportFooter } from "./parts/report-footer";

type MicroLessonPayload = Extract<CachedReportPayload, { kind: "micro-lesson" }>;

export function MicroLessonReport({ payload }: { payload: MicroLessonPayload }) {
  const { aggregates: a, analysis: an, snapshot, generatedAt } = payload;

  return (
    <ReportFrame>
      <section className="flex items-start justify-between gap-8">
        <div className="flex-1">
          <ReportHeader
            topicName={a.topicName}
            subtopicName={a.subtopicName}
            generatedAt={generatedAt}
            durationSeconds={a.durationSeconds}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <StatPill
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              label={`${a.checkinsCorrect}/${a.checkinsTotal} check-ins`}
              tone="success"
            />
            <StatPill
              icon={<BookOpen className="h-3.5 w-3.5" />}
              label={`${a.stepsViewed}/${a.totalSteps} steps`}
              tone="navy"
            />
            {a.chatMessageCount > 0 ? (
              <StatPill
                icon={<MessageSquare className="h-3.5 w-3.5" />}
                label={`${a.chatMessageCount} chat msgs`}
                tone="amber"
              />
            ) : null}
          </div>
        </div>
        <ScoreBadge
          score={a.checkinsCorrect}
          total={Math.max(1, a.checkinsTotal)}
          caption={an.headline}
        />
      </section>

      <ScoreContextStrip text={an.scoreContext} />

      <StrengthsGrowthGrid strengths={an.strengths} growthAreas={an.growthAreas} />

      <section className="grid grid-cols-2 gap-6">
        <div className="flex flex-col justify-center gap-3">
          <SpeedInsight text={an.speedInsight} />
        </div>
        <div className="rounded-2xl border border-border/80 bg-card p-3">
          <MicroLessonAttemptsChart perStepAttempts={snapshot.perStepAttempts} />
        </div>
      </section>

      {snapshot.learningObjectives.length > 0 ? (
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Concepts covered
          </p>
          <ul className="grid grid-cols-2 gap-2">
            {snapshot.learningObjectives.map((objective, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-xl border border-border/60 bg-card px-3 py-2 text-sm"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-athena-success" />
                <span className="leading-snug">{objective}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {a.skill ? (
        <SkillProgress
          level={a.skill.level}
          xp={a.skill.xp}
          streakCorrect={a.skill.streakCorrect}
        />
      ) : null}

      <NextStepCard suggestion={an.nextStepSuggestion} />

      <ReportFooter generatedAt={generatedAt} />
    </ReportFrame>
  );
}

function StatPill({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "success" | "amber" | "navy";
}) {
  const bg =
    tone === "success"
      ? "bg-athena-success/10 text-athena-success"
      : tone === "amber"
        ? "bg-athena-amber/10 text-athena-amber"
        : "bg-athena-navy/5 text-athena-navy";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${bg}`}>
      {icon}
      {label}
    </span>
  );
}
