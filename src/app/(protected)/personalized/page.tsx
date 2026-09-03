"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ChevronLeft, Sparkles } from "lucide-react";
import type { Problem } from "@/components/quiz/types";

// ── Response shape (matches /api/lesson-plan/practice-problems) ──────
type SubtopicMatch = {
  topicSlug: string;
  topicName: string;
  subtopicSlug: string;
  subtopicName: string;
  subtopicId: string;
  weight: number;
  problemCount: number;
  rationale: string;
};

type Classification = {
  subject: "math" | "reading-writing";
  matches: SubtopicMatch[];
  notes: string | null;
};

type ApiResponse = {
  classification: Classification;
  problems: (Problem & { topicSlug: string; subtopicSlug: string })[];
};

// Session-storage handoff key — the quiz layout reads from here on mount.
export const PERSONALIZED_SESSION_KEY = "personalized:session:v1";

export default function PersonalizedPage() {
  const router = useRouter();
  const [plan, setPlan] = useState("");
  const [count, setCount] = useState<3 | 5 | 8>(5);

  const mutation = useMutation<ApiResponse, Error, { plan: string; count: number }>({
    mutationFn: async ({ plan, count }) => {
      const res = await fetch("/api/lesson-plan/practice-problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, count }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Failed (${res.status})`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.problems.length === 0) {
        // Classifier returned no match — stay on the paste page so the
        // student can edit, and surface the notes.
        toast.error(
          data.classification.notes ??
            "We couldn't match this plan to a subtopic. Try a different excerpt."
        );
        return;
      }
      sessionStorage.setItem(PERSONALIZED_SESSION_KEY, JSON.stringify(data));
      router.push("/personalized/quiz/1");
    },
    onError: (e) => toast.error(e.message),
  });

  function submit() {
    const trimmed = plan.trim();
    if (trimmed.length < 20) {
      toast.error("Paste at least a sentence or two of your lesson plan.");
      return;
    }
    mutation.mutate({ plan: trimmed, count });
  }

  const phase: "input" | "loading" = mutation.isPending ? "loading" : "input";

  return (
    <div className="play-stage fixed inset-0 z-50 overflow-x-hidden overflow-y-auto">
      <div
        aria-hidden
        className="play-vignette pointer-events-none fixed inset-[-10%] z-0"
      />
      <div
        aria-hidden
        className="play-grain pointer-events-none fixed inset-0 z-[1]"
      />

      <div className="relative z-20 px-8 pt-6">
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-1.5 text-xs uppercase tracking-[0.28em] text-[var(--p-fg-mute)] transition-colors hover:text-[var(--p-fg)]"
          style={{ fontFamily: "var(--font-jetbrains-mono)" }}
        >
          <ChevronLeft className="h-4 w-4" />
          BACK
        </button>
      </div>

      <div className="relative z-[2] mx-auto w-[min(820px,94vw)] px-6 py-10">
        <AnimatePresence mode="wait">
          {phase === "input" && (
            <PlanInputView
              key="input"
              plan={plan}
              setPlan={setPlan}
              count={count}
              setCount={setCount}
              onSubmit={submit}
            />
          )}
          {phase === "loading" && <LoadingView key="loading" />}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PlanInputView({
  plan,
  setPlan,
  count,
  setCount,
  onSubmit,
}: {
  plan: string;
  setPlan: (v: string) => void;
  count: 3 | 5 | 8;
  setCount: (n: 3 | 5 | 8) => void;
  onSubmit: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center gap-8 text-center"
    >
      <div className="flex flex-col items-center gap-2">
        <div
          className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em]"
          style={{
            color: "var(--p-accent)",
            fontFamily: "var(--font-jetbrains-mono)",
          }}
        >
          <Sparkles className="h-3 w-3" />
          PERSONALIZED PRACTICE
        </div>
        <h1
          className="text-[clamp(32px,4.2vw,48px)] tracking-[-0.01em]"
          style={{
            fontFamily: "var(--font-instrument-serif)",
            fontWeight: 400,
            color: "var(--p-fg)",
          }}
        >
          <span className="italic" style={{ color: "var(--p-fg-dim)" }}>
            from your
          </span>{" "}
          lesson plan
          <span style={{ color: "var(--p-accent)" }}>.</span>
        </h1>
        <p
          className="mt-2 max-w-lg text-sm leading-relaxed"
          style={{ color: "var(--p-fg-dim)" }}
        >
          Paste a unit plan, syllabus excerpt, or teacher's notes. We'll match
          it to our subtopics and pull practice problems for what you're
          actually learning — in the same quiz you already know.
        </p>
      </div>

      <textarea
        value={plan}
        onChange={(e) => setPlan(e.target.value)}
        placeholder="Unit 3: Solving two-step linear equations. Students isolate the variable by reversing the order of operations…"
        rows={10}
        className="w-full resize-y rounded-none px-4 py-3 text-sm leading-relaxed outline-none transition-colors focus:border-[color:var(--p-accent)]"
        style={{
          background: "oklch(0.05 0.005 80 / 0.55)",
          border: "1px solid var(--p-rule)",
          color: "var(--p-fg)",
          fontFamily: "var(--font-jetbrains-mono)",
          caretColor: "var(--p-accent)",
        }}
      />

      <div className="flex w-full items-center justify-between gap-4">
        <div
          className="flex gap-1 rounded-full p-1"
          style={{ border: "1px solid var(--p-rule)" }}
        >
          {[3, 5, 8].map((n) => (
            <button
              key={n}
              onClick={() => setCount(n as 3 | 5 | 8)}
              className="rounded-full px-3.5 py-1.5 text-[10px] uppercase tracking-[0.18em] transition-colors"
              style={{
                fontFamily: "var(--font-jetbrains-mono)",
                background:
                  n === count
                    ? "color-mix(in oklch, var(--p-accent) 22%, transparent)"
                    : "transparent",
                color: n === count ? "var(--p-fg)" : "var(--p-fg-mute)",
              }}
            >
              {n} problems
            </button>
          ))}
        </div>

        <button
          onClick={onSubmit}
          disabled={plan.trim().length < 20}
          className="flex items-center gap-2 px-5 py-2.5 text-[11px] uppercase tracking-[0.22em] transition-all disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            fontFamily: "var(--font-jetbrains-mono)",
            color: "#000",
            background: "var(--p-accent)",
            border: "1px solid var(--p-accent)",
          }}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Start practice
        </button>
      </div>
    </motion.div>
  );
}

function LoadingView() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-[40vh] flex-col items-center justify-center gap-6"
    >
      <div className="relative h-14 w-14">
        <div
          aria-hidden
          className="absolute inset-0 animate-spin rounded-full"
          style={{
            border: "1px solid var(--p-rule)",
            borderTopColor: "var(--p-accent)",
            animationDuration: "1.2s",
          }}
        />
        <Sparkles
          className="absolute inset-0 m-auto h-5 w-5"
          style={{ color: "var(--p-accent)" }}
        />
      </div>
      <div className="flex flex-col items-center gap-1.5">
        <div
          className="text-[10px] uppercase tracking-[0.28em]"
          style={{
            color: "var(--p-accent)",
            fontFamily: "var(--font-jetbrains-mono)",
          }}
        >
          READING YOUR PLAN
        </div>
        <div
          className="text-sm"
          style={{
            color: "var(--p-fg-dim)",
            fontFamily: "var(--font-jetbrains-mono)",
          }}
        >
          Matching subtopics · selecting problems
        </div>
      </div>
    </motion.div>
  );
}
