"use client";

// Dev-only: plays one eval-generated lesson via the full MicroLesson
// component — same TTS, voice orb, observation frame, predict / check_in /
// fill_blank cards, hint flow as production. The lesson is fed via
// `existingLesson` (filesystem-loaded JSON) and `tracking` is omitted so
// no DB tracking calls fire.
//
// Add ?debug=1 to the URL to also surface the per-step flagged-issues
// sidebar alongside the renderer (useful when triaging eval rejects).

import { Suspense, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { WhiteboardStep } from "@/types/whiteboard";
import { MicroLesson } from "@/components/learning/micro-lesson";

type FlagKind =
  | "narration-leak"
  | "contract"
  | "broken-triplet"
  | "orphan"
  | "monotony"
  | "display-narration-gap"
  | "substitution"
  | "fidelity"
  | "equivalence"
  | "line-plot";

type StepFlag = { kind: FlagKind; severity: "strong" | "weak"; reason: string };

type Report = {
  adherence?: {
    suspiciousNarrations?: { stepId: number; severity: "strong" | "weak"; reason: string }[];
    outputContractViolations?: { stepId: number; field: string; reasons: string[] }[];
    brokenTriplets?: { stepIds: number[]; reason: string }[];
    orphanedExpandingOps?: { stepId: number; reason: string }[];
    monotonyRuns?: { startStepId: number; endStepId: number; type: string; length: number }[];
    displayNarrationMismatches?: { stepId: number; severity: "strong" | "weak"; reason: string }[];
    substitutionPatternViolations?: { stepId: number; severity: "strong" | "weak"; reason: string }[];
  } | null;
  math?: {
    fidelityErrors?: { stepId: number; reason: string }[];
    equivalenceErrors?: { stepId: number; reason: string }[];
    lineErrors?: {
      stepId: number;
      elementIndex: number;
      equation: string;
      point: [number, number];
      endpoint: "from" | "to";
      residual: number;
    }[];
  } | null;
  accept?: { pass?: boolean; reasons?: string[] };
};

// Stable empty-metadata reference so MicroLesson doesn't see a fresh
// object identity every render (the underlying useMicroLesson hook
// has effects keyed on this prop).
const DEV_METADATA = {} as const;

const FLAG_COLOR: Record<FlagKind, string> = {
  "narration-leak": "bg-rose-500",
  "contract": "bg-amber-500",
  "broken-triplet": "bg-rose-700",
  "orphan": "bg-rose-700",
  "monotony": "bg-yellow-500",
  "display-narration-gap": "bg-amber-500",
  "substitution": "bg-amber-600",
  "fidelity": "bg-rose-600",
  "equivalence": "bg-rose-600",
  "line-plot": "bg-rose-600",
};

function buildFlagMap(report: Report | null): Map<number, StepFlag[]> {
  const map = new Map<number, StepFlag[]>();
  if (!report) return map;
  const push = (id: number, kind: FlagKind, severity: "strong" | "weak", reason: string) => {
    const list = map.get(id) ?? [];
    list.push({ kind, severity, reason });
    map.set(id, list);
  };
  for (const v of report.adherence?.suspiciousNarrations ?? []) push(v.stepId, "narration-leak", v.severity, v.reason);
  for (const v of report.adherence?.outputContractViolations ?? []) push(v.stepId, "contract", "strong", v.reasons.join("; "));
  for (const v of report.adherence?.brokenTriplets ?? []) for (const id of v.stepIds) push(id, "broken-triplet", "strong", v.reason);
  for (const v of report.adherence?.orphanedExpandingOps ?? []) push(v.stepId, "orphan", "strong", v.reason);
  for (const r of report.adherence?.monotonyRuns ?? []) {
    for (let id = r.startStepId; id <= r.endStepId; id++) {
      push(id, "monotony", "weak", `${r.length}-step ${r.type} run`);
    }
  }
  for (const v of report.adherence?.displayNarrationMismatches ?? []) push(v.stepId, "display-narration-gap", v.severity, v.reason);
  for (const v of report.adherence?.substitutionPatternViolations ?? []) push(v.stepId, "substitution", v.severity, v.reason);
  for (const e of report.math?.fidelityErrors ?? []) push(e.stepId, "fidelity", "strong", e.reason);
  for (const e of report.math?.equivalenceErrors ?? []) push(e.stepId, "equivalence", "strong", e.reason);
  for (const e of report.math?.lineErrors ?? []) {
    const [x, y] = e.point;
    push(
      e.stepId,
      "line-plot",
      "strong",
      `line "${e.equation}" ${e.endpoint}=(${x}, ${y}) doesn't satisfy equation (residual ${e.residual.toFixed(2)})`,
    );
  }
  return map;
}

function DevLessonsPlayPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const lessonRelPath = params.get("path") ?? "";
  const debugMode = params.get("debug") === "1";

  const toggleParam = useCallback((key: string, on: boolean) => {
    const next = new URLSearchParams(params.toString());
    if (on) next.set(key, "1");
    else next.delete(key);
    router.push(`/dev/lessons/play?${next.toString()}`);
  }, [params, router]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dev-lesson", lessonRelPath],
    queryFn: () => fetch(`/api/dev/lessons/load?path=${encodeURIComponent(lessonRelPath)}`).then((r) => {
      if (!r.ok) throw new Error("Failed to load");
      return r.json() as Promise<{ steps: WhiteboardStep[] }>;
    }),
    enabled: !!lessonRelPath,
  });

  const { data: reportRaw } = useQuery({
    queryKey: ["dev-lesson-report", lessonRelPath],
    queryFn: () => {
      const reportPath = lessonRelPath.replace(/\/lesson\.json$/, "/report.json");
      return fetch(`/api/dev/lessons/load?path=${encodeURIComponent(reportPath)}`).then((r) => {
        if (!r.ok) return { steps: null } as unknown as { steps: Report | null };
        return r.json();
      });
    },
    enabled: !!lessonRelPath && debugMode,
  });

  const steps = useMemo<WhiteboardStep[]>(() => {
    const arr = data?.steps;
    return Array.isArray(arr) ? arr : [];
  }, [data]);

  // Memoize the existingLesson prop. A fresh `{...}` literal each render
  // causes useMicroLesson's `useEffect([existingLesson])` to re-run on
  // every render, which resets steps + triggers the player's auto-start
  // effect — leading to "Maximum update depth exceeded" via the rAF tick
  // → setState → re-render → effect → startStep cycle.
  const existingLesson = useMemo(
    () => ({ lessonContent: "", whiteboardSteps: steps }),
    [steps],
  );

  const report: Report | null = useMemo(() => {
    if (!reportRaw) return null;
    const obj = (reportRaw as { steps?: unknown }).steps;
    return Array.isArray(obj) ? null : ((reportRaw as { steps: Report }).steps ?? null);
  }, [reportRaw]);

  const flagMap = useMemo(() => buildFlagMap(report), [report]);

  // Parse the path to surface a useful subtopic label in the header.
  //   eval iters: .local/evals/<variant>/<topic>/<subtopic>/iter-N/lesson.json
  //   ideals:     src/lib/evals/ideal-lessons/<topic>-<subtopic>.json
  const { variant, topicSlug, subtopicSlug, iterLabel } = (() => {
    const parts = lessonRelPath.split("/");
    if (parts[0] === "src" && parts[3] === "ideal-lessons") {
      const stem = (parts[4] ?? "").replace(/\.json$/, "");
      let topic = "ideal";
      let subtopic = stem;
      for (const prefix of ["advanced-math-", "algebra-"]) {
        if (stem.startsWith(prefix)) {
          topic = prefix.slice(0, -1);
          subtopic = stem.slice(prefix.length);
          break;
        }
      }
      return { variant: "ideal", topicSlug: topic, subtopicSlug: subtopic, iterLabel: "" };
    }
    return {
      variant: parts[2] ?? "",
      topicSlug: parts[3] ?? "",
      subtopicSlug: parts[4] ?? "",
      iterLabel: parts[5] ?? "",
    };
  })();

  if (!lessonRelPath) {
    return (
      <div className="p-8">
        <p>Missing <code>?path=</code> query parameter.</p>
        <Link href="/dev/lessons" className="text-blue-600 underline">Back to list</Link>
      </div>
    );
  }
  if (isLoading) return <div className="p-8">Loading…</div>;
  if (isError || !steps.length) return <div className="p-8 text-rose-600">Failed to load lesson.</div>;

  return (
    <div className="relative h-screen flex flex-col">
      <header className="border-b px-4 py-2 flex items-center justify-between gap-4 text-sm bg-background z-10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/dev/lessons" className="text-blue-600 hover:underline shrink-0">← list</Link>
          <span className="font-mono text-xs text-muted-foreground truncate">
            {variant}/{topicSlug}/{subtopicSlug}/{iterLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleParam("debug", !debugMode)}
            className="px-2 py-1 rounded border text-xs"
          >
            {debugMode ? "hide flags" : "show flags"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 relative min-w-0">
          <MicroLesson
            topic={topicSlug || "dev"}
            subtopic={subtopicSlug || "dev"}
            metadata={DEV_METADATA}
            existingLesson={existingLesson}
            onClose={() => router.push("/dev/lessons")}
            debugScrub
          />
        </div>

        {debugMode && (
          <aside className="w-96 border-l overflow-y-auto px-4 py-3 text-sm bg-background">
            <div className="text-xs uppercase text-muted-foreground mb-2">all steps</div>
            <div className="grid grid-cols-10 gap-1 mb-4">
              {steps.map((s) => {
                const flags = flagMap.get(s.id) ?? [];
                const hasStrong = flags.some((f) => f.severity === "strong");
                const hasWeak = flags.some((f) => f.severity === "weak");
                return (
                  <span
                    key={s.id}
                    title={`step ${s.id} · ${s.action.type}${flags.length ? ` · ${flags.map((f) => f.kind).join(", ")}` : ""}`}
                    className={`h-6 rounded text-xs font-mono flex items-center justify-center ${
                      hasStrong
                        ? "bg-rose-500 text-white"
                        : hasWeak
                          ? "bg-amber-300"
                          : "bg-muted"
                    }`}
                  >
                    {s.id}
                  </span>
                );
              })}
            </div>

            <div className="text-xs uppercase text-muted-foreground mb-2">flagged steps</div>
            <div className="space-y-2">
              {[...flagMap.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([id, flags]) => (
                  <div key={id} className="border rounded p-2">
                    <div className="font-mono text-xs mb-1">step {id}</div>
                    {flags.map((f, i) => (
                      <div key={i} className={`text-xs text-white px-2 py-1 rounded mb-1 ${FLAG_COLOR[f.kind]}`}>
                        <strong>{f.kind}</strong> ({f.severity}): {f.reason}
                      </div>
                    ))}
                  </div>
                ))}
              {flagMap.size === 0 && (
                <div className="text-xs text-muted-foreground">no flagged steps</div>
              )}
            </div>

            {report?.accept && (
              <div className="mt-6 pt-4 border-t">
                <div className="text-xs uppercase text-muted-foreground mb-1">verdict</div>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${report.accept.pass ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}>
                  {report.accept.pass ? "PASS" : "FAIL"}
                </span>
                {report.accept.reasons && report.accept.reasons.length > 0 && (
                  <ul className="text-xs text-muted-foreground mt-2 list-disc pl-5 space-y-1">
                    {report.accept.reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

export default function DevLessonsPlayPage() {
  return (
    <Suspense fallback={null}>
      <DevLessonsPlayPageInner />
    </Suspense>
  );
}
