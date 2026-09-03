"use client";

// Dev-only: lists eval-generated lessons from .local/evals/ and links to
// the player. Gated behind NODE_ENV; renders nothing in production
// (the API also 404s, so even if this leaked the data wouldn't load).

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

type IterMeta = {
  variant: string;
  topicSlug: string;
  subtopicSlug: string;
  iter: number;
  pass: boolean;
  adherenceScore: number;
  mathScore: number | null;
  tripletCount: number;
  expectedTripletCount: number;
  stepCount: number;
  reasons: string[];
  lessonRelPath: string;
};

const SCORE_COLOR = (n: number, threshold: number) =>
  n >= threshold ? "text-emerald-600" : n >= threshold * 0.6 ? "text-amber-600" : "text-rose-600";

export default function DevLessonsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dev-lessons"],
    queryFn: () => fetch("/api/dev/lessons").then((r) => {
      if (!r.ok) throw new Error("Failed to load lessons");
      return r.json() as Promise<{ iters: IterMeta[] }>;
    }),
    staleTime: 5_000,
  });
  const [variantFilter, setVariantFilter] = useState<string>("");
  const [subtopicFilter, setSubtopicFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pass" | "fail">("all");

  const iters = data?.iters ?? [];
  const variants = useMemo(() => Array.from(new Set(iters.map((i) => i.variant))).sort(), [iters]);
  const subtopics = useMemo(
    () =>
      Array.from(new Set(iters.map((i) => `${i.topicSlug}/${i.subtopicSlug}`))).sort(),
    [iters],
  );

  const filtered = iters.filter((i) => {
    if (variantFilter && i.variant !== variantFilter) return false;
    if (subtopicFilter && `${i.topicSlug}/${i.subtopicSlug}` !== subtopicFilter) return false;
    if (statusFilter === "pass" && !i.pass) return false;
    if (statusFilter === "fail" && i.pass) return false;
    return true;
  });

  const variantCounts = useMemo(() => {
    const acc: Record<string, { total: number; pass: number }> = {};
    for (const it of iters) {
      const e = (acc[it.variant] ??= { total: 0, pass: 0 });
      e.total++;
      if (it.pass) e.pass++;
    }
    return acc;
  }, [iters]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 text-sm">
      <h1 className="text-2xl font-bold mb-1">Dev · Eval Lessons</h1>
      <p className="text-muted-foreground mb-6">
        Filesystem-loaded lessons under <code>.local/evals/</code>. Click a row to play it in the
        whiteboard renderer without touching the production database.
      </p>

      {isLoading && <div>Loading…</div>}
      {isError && <div className="text-rose-600">Failed to load. Are you in dev mode?</div>}

      {data && (
        <>
          <div className="flex gap-2 mb-3 flex-wrap">
            {variants.map((v) => (
              <button
                key={v}
                onClick={() => setVariantFilter(variantFilter === v ? "" : v)}
                className={`px-3 py-1 rounded border text-xs font-mono ${variantFilter === v ? "bg-foreground text-background" : "bg-muted"}`}
              >
                {v} <span className="opacity-60">({variantCounts[v].pass}/{variantCounts[v].total})</span>
              </button>
            ))}
            {variantFilter && (
              <button onClick={() => setVariantFilter("")} className="px-3 py-1 rounded border text-xs">
                clear variant
              </button>
            )}
          </div>

          <div className="flex gap-2 mb-3 flex-wrap items-center">
            <select
              value={subtopicFilter}
              onChange={(e) => setSubtopicFilter(e.target.value)}
              className="px-2 py-1 rounded border text-xs font-mono bg-background"
            >
              <option value="">all subtopics</option>
              {subtopics.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "pass" | "fail")}
              className="px-2 py-1 rounded border text-xs bg-background"
            >
              <option value="all">all</option>
              <option value="pass">pass only</option>
              <option value="fail">fail only</option>
            </select>
            <span className="text-muted-foreground">{filtered.length} of {iters.length}</span>
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr className="text-xs uppercase text-muted-foreground border-b">
                <th className="text-left py-2 px-2">variant</th>
                <th className="text-left py-2 px-2">subtopic</th>
                <th className="text-left py-2 px-2">iter</th>
                <th className="text-right py-2 px-2">steps</th>
                <th className="text-right py-2 px-2">adh</th>
                <th className="text-right py-2 px-2">math</th>
                <th className="text-right py-2 px-2">triplets</th>
                <th className="text-left py-2 px-2">verdict</th>
                <th className="text-left py-2 px-2 w-1/3">reasons</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.lessonRelPath} className="border-b hover:bg-muted/40">
                  <td className="py-2 px-2 font-mono text-xs">{it.variant}</td>
                  <td className="py-2 px-2 font-mono text-xs">
                    {it.topicSlug}/{it.subtopicSlug}
                  </td>
                  <td className="py-2 px-2">
                    <Link
                      href={`/dev/lessons/play?path=${encodeURIComponent(it.lessonRelPath)}`}
                      className="text-blue-600 hover:underline"
                    >
                      iter-{it.iter}
                    </Link>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">{it.stepCount}</td>
                  <td className={`py-2 px-2 text-right tabular-nums ${SCORE_COLOR(it.adherenceScore, 0.85)}`}>
                    {it.adherenceScore.toFixed(2)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {it.mathScore !== null ? it.mathScore.toFixed(2) : "—"}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums">
                    {it.tripletCount}/{it.expectedTripletCount}
                  </td>
                  <td className="py-2 px-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${it.pass ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}`}>
                      {it.pass ? "PASS" : "FAIL"}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-xs text-muted-foreground truncate" title={it.reasons.join(" | ")}>
                    {it.reasons.slice(0, 2).join(" · ")}
                    {it.reasons.length > 2 ? ` +${it.reasons.length - 2}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
