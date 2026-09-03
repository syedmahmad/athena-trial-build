"use client";

import type { CachedReportPayload } from "@/lib/reports/types";
import { ReportFrame } from "./report-frame";
import { ReportHeader } from "./parts/report-header";
import { ScoreBadge } from "./parts/score-badge";
import { ScoreContextStrip } from "./parts/score-context-strip";
import { StrengthsGrowthGrid } from "./parts/strengths-growth-grid";
import { SpeedInsight } from "./parts/speed-insight";
import { QuizSpeedChart } from "./parts/speed-timeline";
import { QuestionMosaic } from "./parts/question-mosaic";
import { SkillProgress } from "./parts/skill-progress";
import { NextStepCard } from "./parts/next-step-card";
import { ReportFooter } from "./parts/report-footer";

type QuizPayload = Extract<CachedReportPayload, { kind: "quiz" }>;

export function QuizReport({ payload }: { payload: QuizPayload }) {
  const { aggregates: a, analysis: an, generatedAt } = payload;

  return (
    <ReportFrame>
      <section className="flex items-start justify-between gap-8">
        <div className="flex-1">
          <ReportHeader
            topicName={a.topicName}
            subtopicName={a.subtopicName}
            generatedAt={generatedAt}
            durationSeconds={a.timeElapsedSeconds}
          />
        </div>
        <ScoreBadge
          score={a.score}
          total={a.totalQuestions}
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
          <QuizSpeedChart
            perQuestion={a.perQuestion.map((q) => ({
              index: q.index,
              responseTimeMs: q.responseTimeMs,
              isCorrect: q.isCorrect,
            }))}
            medianMs={a.medianResponseTimeMs}
          />
        </div>
      </section>

      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Question-by-question
        </p>
        <QuestionMosaic perQuestion={a.perQuestion} />
        <p className="mt-2 text-[11px] text-muted-foreground">
          <span className="mr-3 inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-athena-success/40" />
            first try
          </span>
          <span className="mr-3 inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-athena-amber/40" />
            with help
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm bg-destructive/40" />
            missed
          </span>
        </p>
      </section>

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
