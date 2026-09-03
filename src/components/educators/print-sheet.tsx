"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, Loader2, Printer } from "lucide-react";
import Link from "next/link";
import {
  type EducatorAssignment,
} from "@/hooks/use-educators";
import { MathContent } from "@/components/quiz/math-content";
import {
  formatLongDate,
  OPTION_LETTERS,
  isPracticeSet,
  isFreeResponseQuiz,
  type AssignmentQuestion,
  type FreeResponseQuestion,
} from "@/lib/educators";

/**
 * Teacher-only print view: a light, typeset worksheet rendered for
 * window.print() → "Save as PDF". The Name/Date header lines live HERE (at
 * print time), not in the stored content. The answer key prints on its own
 * page and can be toggled off for the student copy.
 */
export function PrintSheet({ assignmentId }: { assignmentId: string }) {
  // Auth enforced server-side by the middleware (PROTECTED_PREFIXES). Render
  // directly — the old client SignedIn gate bounced authenticated teachers to
  // /sign-in on a cold-load session race.
  return <SheetInner assignmentId={assignmentId} />;
}

function SheetInner({ assignmentId }: { assignmentId: string }) {
  const [includeKey, setIncludeKey] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["educator", "assignments"],
    queryFn: () =>
      fetch("/api/educators/assignments").then((r) => {
        if (!r.ok) throw new Error("Failed to load homework");
        return r.json() as Promise<{ assignments: EducatorAssignment[] }>;
      }),
    staleTime: 60_000,
  });

  const a = data?.assignments.find((x) => x.id === assignmentId) ?? null;
  const hasKey = !!a && (!!a.answerKey || !!a.questions);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-neutral-500">
        <Loader2 className="animate-spin" size={18} />
      </div>
    );
  }
  if (!a) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-neutral-800">
        Assignment not found.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* Toolbar — hidden when printing */}
      <div className="border-b border-neutral-200 bg-neutral-50 px-6 py-3 print:hidden">
        <div className="mx-auto flex max-w-[7.5in] items-center justify-between gap-3">
          <Link
            href="/educators/homework"
            className="flex items-center gap-2 text-sm text-neutral-600 transition hover:text-neutral-900"
          >
            <ArrowLeft size={14} />
            Back to homework
          </Link>
          <div className="flex items-center gap-4">
            {hasKey && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={includeKey}
                  onChange={(e) => setIncludeKey(e.target.checked)}
                  className="h-4 w-4 accent-neutral-900"
                />
                <KeyRound size={13} />
                Include answer key (teacher copy)
              </label>
            )}
            <button
              onClick={() => window.print()}
              className="flex h-9 items-center gap-2 rounded-full bg-neutral-900 px-5 text-sm text-white transition hover:bg-neutral-700"
            >
              <Printer size={14} />
              Print / Save as PDF
            </button>
          </div>
        </div>
      </div>

      {/* Worksheet */}
      <div className="mx-auto max-w-[7.5in] px-8 py-10 print:px-0 print:py-0">
        <header className="border-b-2 border-neutral-900 pb-4">
          <h1 className="font-serif text-3xl leading-tight">{a.title}</h1>
          <div className="mt-2 flex items-center justify-between text-sm text-neutral-600">
            <span>Due {formatLongDate(a.dueDate)}</span>
            <span className="text-neutral-400">Athena · Educators</span>
          </div>
        </header>

        {/* Print-time student header lines */}
        <div className="mt-5 flex items-end gap-8 text-[15px]">
          <span className="flex-1 whitespace-nowrap">
            Name <span className="ml-1 inline-block w-full max-w-[260px] border-b border-neutral-400" />
          </span>
          <span className="whitespace-nowrap">
            Date <span className="ml-1 inline-block w-28 border-b border-neutral-400" />
          </span>
        </div>

        <article className="mt-8 whitespace-pre-wrap text-[15px] leading-[1.8]">
          {a.instructions}
        </article>

        {isPracticeSet(a.questions) && (
          <ol className="mt-8 space-y-7">
            {(a.questions as AssignmentQuestion[]).map((q, qi) => (
              <li key={q.id} className="break-inside-avoid">
                <div className="flex gap-3 text-[15px] leading-relaxed">
                  <span className="font-medium">{qi + 1}.</span>
                  <MathContent content={q.prompt} size="base" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 pl-7">
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2 text-[15px]">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-neutral-400 text-[11px]">
                        {OPTION_LETTERS[oi]}
                      </span>
                      <MathContent content={opt} size="sm" />
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}

        {isFreeResponseQuiz(a.questions) && (
          <ol className="mt-8 space-y-8">
            {(a.questions as FreeResponseQuestion[]).map((q, qi) => (
              <li key={q.id} className="break-inside-avoid">
                <div className="flex gap-3 text-[15px] leading-relaxed">
                  <span className="font-medium">{qi + 1}.</span>
                  <MathContent content={q.prompt} size="base" />
                </div>
                <div className="mt-4 ml-7 space-y-4">
                  <div className="border-b border-neutral-300" />
                  <div className="border-b border-neutral-300" />
                </div>
              </li>
            ))}
          </ol>
        )}

        {includeKey && hasKey && (
          <section className="mt-10 break-before-page">
            <header className="border-b-2 border-neutral-900 pb-3">
              <h2 className="font-serif text-2xl">{a.title}: Answer Key</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Teacher copy. Do not distribute.
              </p>
            </header>
            {isPracticeSet(a.questions) ? (
              <ol className="mt-6 space-y-3">
                {(a.questions as AssignmentQuestion[]).map((q, qi) => (
                  <li key={q.id} className="flex gap-3 text-[15px] leading-relaxed">
                    <span className="font-medium">{qi + 1}.</span>
                    <div>
                      <span className="mr-2 font-semibold">
                        {OPTION_LETTERS[q.correctIndex]}
                      </span>
                      <MathContent content={q.options[q.correctIndex] ?? ""} size="sm" />
                      {q.explanation && (
                        <div className="mt-1 text-sm text-neutral-600">
                          <MathContent content={q.explanation} size="sm" />
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <article className="mt-6 whitespace-pre-wrap text-[15px] leading-[1.8]">
                {a.answerKey}
              </article>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
