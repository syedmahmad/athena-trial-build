"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Headphones,
  Image as ImageIcon,
  Layers,
  Sparkles,
} from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────
type Mode = "lesson" | "practice" | "chat";
type Subject = "math" | "reading-writing" | "science" | "social-studies";

type Subtopic = {
  id: string;
  slug: string;
  name: string;
  difficulty: string | null;
  estimatedMinutes: number | null;
  description: string | null;
  lastVisitedAt: string | null;
  completed: boolean;
  stepsViewed: number | null;
  totalSteps: number | null;
};

function formatRelativeDay(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function progressPercent(viewed: number | null, total: number | null): number | null {
  if (!viewed || !total || total <= 0) return null;
  return Math.min(100, Math.round((viewed / total) * 100));
}

type Topic = {
  id: string;
  slug: string;
  name: string;
  subject: string;
  overview: string | null;
  subtopics: Subtopic[];
};

// ── Modes ────────────────────────────────────────────────────────────
type ModeMeta = {
  key: Mode;
  title: string;
  desc: string;
  cta: string;
  Icon: () => React.ReactElement;
};

const MODES: ModeMeta[] = [
  {
    key: "lesson",
    title: "Structured lesson",
    desc: "A full lesson about this topic. Best for beginners — paced from first principles.",
    cta: "Start lesson",
    Icon: IconLesson,
  },
  {
    key: "practice",
    title: "Practice problems",
    desc: "Calibrated problems. Difficulty adapts as your accuracy stabilizes.",
    cta: "Solve problems",
    Icon: IconPractice,
  },
  {
    key: "chat",
    title: "Just chat",
    desc: "Open the floor. Ask anything, explore tangents, think out loud.",
    cta: "Get custom help",
    Icon: IconChat,
  },
];

const SUBJECTS: { key: Subject; label: string }[] = [
  { key: "math", label: "Math" },
  { key: "reading-writing", label: "Reading & Writing" },
  { key: "science", label: "Science" },
  { key: "social-studies", label: "Social Studies" },
];

// Deterministic spark constellation rising from the orb. Hand-distributed
// so each spark has its own travel path; values intentionally fixed so
// SSR and client render the same DOM.
const SPARKS: ReadonlyArray<{
  id: number;
  left: number;
  top: number;
  delay: number;
  dx: number;
}> = [
  { id: 0, left: 34, top: 64, delay: 0.0, dx: -18 },
  { id: 1, left: 42, top: 78, delay: 0.6, dx: 8 },
  { id: 2, left: 50, top: 70, delay: 1.2, dx: -4 },
  { id: 3, left: 58, top: 82, delay: 1.9, dx: 14 },
  { id: 4, left: 64, top: 66, delay: 2.5, dx: -10 },
  { id: 5, left: 38, top: 86, delay: 3.1, dx: 22 },
  { id: 6, left: 54, top: 62, delay: 3.6, dx: -22 },
  { id: 7, left: 46, top: 88, delay: 4.2, dx: 4 },
];

function routeFor(mode: Mode, topicSlug: string, subtopicSlug: string) {
  switch (mode) {
    case "lesson":
      return `/learning/${topicSlug}/${subtopicSlug}/micro-lesson`;
    case "practice":
      return `/learning/${topicSlug}/${subtopicSlug}/quiz/1`;
    case "chat":
      return `/mentor`;
  }
}

// ── Page ─────────────────────────────────────────────────────────────
export default function PlayPage() {
  const router = useRouter();
  const { data: userData } = useCurrentUser();
  const [mode, setMode] = useState<Mode | null>(null);
  const [subject, setSubject] = useState<Subject>("math");
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<{ topics: Topic[] }>({
    queryKey: ["learning"],
    queryFn: () =>
      fetch("/api/learning").then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      }),
    staleTime: 10 * 60_000,
    enabled: mode !== null && mode !== "chat",
  });

  useEffect(() => {
    if (isError) toast.error("Failed to load topics");
  }, [isError]);

  const firstName = useMemo(() => {
    const n = userData?.user?.displayName?.trim();
    if (!n) return null;
    return n.split(/\s+/)[0];
  }, [userData]);

  function handlePickMode(m: Mode) {
    if (m === "chat") {
      router.push("/mentor");
      return;
    }
    setMode(m);
  }

  // 1 / 2 / 3 keyboard shortcuts on the mode picker.
  useEffect(() => {
    if (mode !== null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "1") handlePickMode("lesson");
      else if (e.key === "2") handlePickMode("practice");
      else if (e.key === "3") handlePickMode("chat");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const topics = (data?.topics ?? []).filter((t) => t.subject === subject);

  return (
    <div className="play-stage fixed inset-0 z-50 overflow-x-hidden overflow-y-auto">
      {/* Vignette + grain — fixed full-screen layers, behind content. */}
      <div
        aria-hidden
        className="play-vignette pointer-events-none fixed inset-[-10%] z-0"
      />
      <div
        aria-hidden
        className="play-grain pointer-events-none fixed inset-0 z-[1]"
      />

      {/* Back affordance — only when a mode has been picked. */}
      {mode && (
        <div className="relative z-20 px-4 pt-6 sm:px-8">
          <button
            onClick={() => {
              setMode(null);
              setExpandedTopicId(null);
            }}
            className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.28em] text-[var(--p-fg-mute)] transition-colors hover:text-[var(--p-fg)]"
            style={{ fontFamily: "var(--font-jetbrains-mono)" }}
          >
            <ChevronLeft className="h-4 w-4" />
            BACK
          </button>
        </div>
      )}

      <div className="relative z-[2] mx-auto grid min-h-full w-[min(1080px,94vw)] place-items-center px-6 py-10 text-center">
        <AnimatePresence mode="wait">
          {mode === null ? (
            <ModePicker key="mode" onPick={handlePickMode} firstName={firstName} />
          ) : (
            <TopicPicker
              key="topic"
              mode={mode}
              subject={subject}
              onSubject={setSubject}
              topics={topics}
              isLoading={isLoading}
              expandedTopicId={expandedTopicId}
              setExpandedTopicId={setExpandedTopicId}
              onPick={(topicSlug, subtopicSlug) => {
                router.push(routeFor(mode, topicSlug, subtopicSlug));
              }}
              onPickPodcast={(subtopicId) =>
                router.push(`/podcast/${subtopicId}`)
              }
              onPickInfographic={(subtopicId) =>
                router.push(`/infographic/${subtopicId}`)
              }
              onPickFlashcards={(topicSlug, subtopicSlug) =>
                router.push(`/flashcards/${topicSlug}/${subtopicSlug}`)
              }
              onPickPersonalized={() => router.push("/personalized")}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Mode picker — the new onboarding-style hello + 3 cards ───────────
function ModePicker({
  onPick,
  firstName,
}: {
  onPick: (m: Mode) => void;
  firstName: string | null;
}) {
  // Sparks render deterministic on SSR + first paint (so hydration
  // matches), then re-randomize after mount so each visit feels organic.
  // The CSS animation keeps running through the swap; the new positions
  // just take effect on the next iteration of the keyframes.
  const [sparks, setSparks] = useState<typeof SPARKS>(SPARKS);
  useEffect(() => {
    setSparks(
      Array.from({ length: 8 }).map((_, i) => ({
        id: i,
        left: 30 + Math.random() * 40,
        top: 60 + Math.random() * 30,
        delay: Math.random() * 4.5,
        dx: (Math.random() - 0.5) * 50,
      })),
    );
  }, []);

  return (
    <div className="flex w-full flex-col items-center">
      {/* Orb */}
      <div className="play-anim-orb relative mx-auto mb-[22px] flex h-[180px] w-[180px] items-center justify-center">
        <svg
          className="play-orb-ring pointer-events-none absolute inset-0"
          viewBox="0 0 180 180"
        >
          <circle
            cx="90"
            cy="90"
            r="74"
            fill="none"
            stroke="oklch(0.55 0.04 60 / 0.45)"
            strokeWidth="0.5"
            strokeDasharray="1 5"
          />
          <circle
            cx="90"
            cy="90"
            r="84"
            fill="none"
            stroke="oklch(0.55 0.04 60 / 0.45)"
            strokeWidth="0.5"
            strokeDasharray="0.6 8"
          />
          <circle cx="90" cy="10" r="1.4" fill="oklch(0.78 0.10 60 / 0.7)" />
          <circle cx="170" cy="90" r="1.4" fill="oklch(0.78 0.10 60 / 0.7)" />
          <circle cx="90" cy="170" r="1.4" fill="oklch(0.78 0.10 60 / 0.7)" />
          <circle cx="10" cy="90" r="1.4" fill="oklch(0.78 0.10 60 / 0.7)" />
        </svg>
        <div className="play-orb" />
        {sparks.map((s) => (
          <span
            key={s.id}
            className="play-spark"
            style={
              {
                left: `${s.left}%`,
                top: `${s.top}%`,
                animationDelay: `${s.delay}s`,
                "--dx": `${s.dx}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* Headline */}
      <h1
        className="play-anim-h1 m-0 text-[clamp(44px,5.6vw,68px)] leading-[1.02] tracking-[-0.02em]"
        style={{ fontFamily: "var(--font-instrument-serif)", fontWeight: 400 }}
      >
        <span className="italic" style={{ color: "var(--p-fg-dim)" }}>
          hello,
        </span>{" "}
        <span className="relative" style={{ color: "var(--p-fg)" }}>
          {firstName ?? "friend"}
          <span className="play-anim-name-underline" />
        </span>
        <span style={{ color: "var(--p-accent)" }}>.</span>
      </h1>

      {/* Subtitle */}
      <div
        className="play-anim-sub mt-3 text-[clamp(20px,2.2vw,26px)] tracking-[-0.01em]"
        style={{
          fontFamily: "var(--font-instrument-serif)",
          fontStyle: "italic",
          color: "var(--p-fg-mute)",
        }}
      >
        ready to learn?
      </div>

      {/* mode card grid */}
      <div className="mt-11 grid w-full grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
        {MODES.map((m) => (
          <ModeCard key={m.key} mode={m} onPick={onPick} />
        ))}
      </div>

      <div
        className="mt-10 font-mono text-[10px] uppercase tracking-[0.28em]"
        style={{
          color: "var(--p-fg-faint)",
          fontFamily: "var(--font-jetbrains-mono)",
        }}
      >
        press 1 · 2 · 3 to choose
      </div>
    </div>
  );
}

function ModeCard({
  mode,
  onPick,
}: {
  mode: ModeMeta;
  onPick: (m: Mode) => void;
}) {
  const Icon = mode.Icon;
  return (
    <button
      type="button"
      onClick={() => onPick(mode.key)}
      className={cn(
        "play-card group relative flex min-h-[320px] cursor-pointer flex-col items-center overflow-hidden text-center",
        "px-[26px] pb-[22px] pt-[28px]",
      )}
      style={{
        background: "oklch(0.05 0.005 80 / 0.55)",
        border: "1px solid var(--p-rule)",
        color: "var(--p-fg)",
        fontFamily: "var(--font-jetbrains-mono)",
        transition:
          "border-color 320ms ease, background 320ms ease, transform 320ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "oklch(0.55 0.10 60 / 0.7)";
        e.currentTarget.style.background = "oklch(0.07 0.01 60 / 0.6)";
        e.currentTarget.style.transform = "translateY(-3px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--p-rule)";
        e.currentTarget.style.background = "oklch(0.05 0.005 80 / 0.55)";
        e.currentTarget.style.transform = "";
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = "oklch(0.55 0.10 60 / 0.7)";
        e.currentTarget.style.background = "oklch(0.07 0.01 60 / 0.6)";
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.outline = "none";
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = "var(--p-rule)";
        e.currentTarget.style.background = "oklch(0.05 0.005 80 / 0.55)";
        e.currentTarget.style.transform = "";
      }}
    >
      {/* Hover wash */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, oklch(0.30 0.10 55 / 0.25), transparent 60%)",
        }}
      />
      {/* Sweep highlight */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full transition-transform duration-700 group-hover:translate-x-full group-focus-visible:translate-x-full"
        style={{
          background:
            "linear-gradient(120deg, transparent 30%, oklch(0.85 0.10 60 / 0.07) 50%, transparent 70%)",
        }}
      />

      {/* Corner brackets */}
      <Corner pos="tl" />
      <Corner pos="tr" />
      <Corner pos="bl" />
      <Corner pos="br" />

      {/* Icon */}
      <div className="mt-1.5 mb-[22px] flex h-[92px] w-full items-center justify-center">
        <div className={`relative flex h-[72px] w-[72px] items-center justify-center play-ic-${mode.key}`}>
          <Icon />
        </div>
      </div>

      {/* Title */}
      <h3
        className="m-0 text-[clamp(22px,6vw,30px)] leading-[1.05] tracking-[-0.01em]"
        style={{
          fontFamily: "var(--font-instrument-serif)",
          fontWeight: 400,
          color: "var(--p-fg)",
        }}
      >
        {mode.title}
      </h3>

      {/* Description */}
      <p
        className="mx-auto mt-2.5 max-w-[28ch] text-[12px] leading-[1.55]"
        style={{
          fontFamily: "var(--font-jetbrains-mono)",
          color: "var(--p-fg-dim)",
        }}
      >
        {mode.desc}
      </p>

      {/* CTA strip */}
      <div
        className="mt-auto flex w-full items-center justify-center gap-2.5 pt-4 text-[11px] uppercase tracking-[0.32em] transition-colors duration-300 group-hover:text-[color:var(--p-accent)] group-focus-visible:text-[color:var(--p-accent)] group-hover:tracking-[0.36em] group-focus-visible:tracking-[0.36em]"
        style={{
          marginTop: "22px",
          paddingTop: "16px",
          borderTop: "1px solid oklch(0.18 0.005 80)",
          color: "var(--p-fg-dim)",
        }}
      >
        <span>{mode.cta}</span>
        <span className="inline-flex items-center transition-transform duration-300 group-hover:translate-x-1 group-focus-visible:translate-x-1">
          <svg viewBox="0 0 22 8" className="h-2 w-[22px]">
            <line x1="0" y1="4" x2="20" y2="4" stroke="currentColor" strokeWidth="1" fill="none" />
            <path d="M16 1 L20 4 L16 7" stroke="currentColor" strokeWidth="1" fill="none" />
          </svg>
        </span>
      </div>
    </button>
  );
}

function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const base = "pointer-events-none absolute h-2 w-2";
  const positional = {
    tl: "left-2 top-2 border-t border-l",
    tr: "right-2 top-2 border-t border-r",
    bl: "left-2 bottom-2 border-b border-l",
    br: "right-2 bottom-2 border-b border-r",
  }[pos];
  return (
    <span
      className={cn(base, positional, "transition-colors duration-300 group-hover:border-[color:var(--p-accent)] group-focus-visible:border-[color:var(--p-accent)]")}
      style={{ borderColor: "var(--p-fg-faint)" }}
    />
  );
}

// ── Topic picker — restyled to match the new aesthetic ───────────────
function TopicPicker({
  mode,
  subject,
  onSubject,
  topics,
  isLoading,
  expandedTopicId,
  setExpandedTopicId,
  onPick,
  onPickPodcast,
  onPickInfographic,
  onPickFlashcards,
  onPickPersonalized,
}: {
  mode: Mode;
  subject: Subject;
  onSubject: (s: Subject) => void;
  topics: Topic[];
  isLoading: boolean;
  expandedTopicId: string | null;
  setExpandedTopicId: (id: string | null) => void;
  onPick: (topicSlug: string, subtopicSlug: string) => void;
  onPickPodcast: (subtopicId: string) => void;
  onPickInfographic: (subtopicId: string) => void;
  onPickFlashcards: (topicSlug: string, subtopicSlug: string) => void;
  onPickPersonalized: () => void;
}) {
  const modeMeta = MODES.find((m) => m.key === mode)!;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3 }}
      className="flex w-full max-w-3xl flex-col items-center gap-6"
    >
      <div className="flex flex-col items-center gap-2">
        <div
          className="text-[10px] uppercase tracking-[0.28em]"
          style={{
            color: "var(--p-accent)",
            fontFamily: "var(--font-jetbrains-mono)",
          }}
        >
          {modeMeta.title}
        </div>
        <h2
          className="text-[clamp(28px,3.6vw,40px)] tracking-[-0.01em]"
          style={{
            fontFamily: "var(--font-instrument-serif)",
            fontWeight: 400,
            color: "var(--p-fg)",
          }}
        >
          <span className="italic" style={{ color: "var(--p-fg-dim)" }}>
            pick
          </span>{" "}
          a topic
          <span style={{ color: "var(--p-accent)" }}>.</span>
        </h2>
      </div>

      {/* Subject toggle */}
      <div
        className="flex max-w-full flex-wrap justify-center gap-1 rounded-2xl p-1 sm:flex-nowrap sm:overflow-x-auto sm:rounded-full"
        style={{ border: "1px solid var(--p-rule)" }}
      >
        {SUBJECTS.map((s) => (
          <button
            key={s.key}
            onClick={() => onSubject(s.key)}
            className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 text-[10px] uppercase tracking-[0.18em] transition-colors sm:px-4"
            style={{
              fontFamily: "var(--font-jetbrains-mono)",
              background:
                s.key === subject
                  ? "color-mix(in oklch, var(--p-accent) 22%, transparent)"
                  : "transparent",
              color: s.key === subject ? "var(--p-fg)" : "var(--p-fg-mute)",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Personalized — only on practice mode. Sits above the canonical
          topic list because it skips topic/subtopic selection entirely:
          the student pastes a lesson plan and the classifier picks the
          subtopics. */}
      {mode === "practice" && (
        <button
          onClick={onPickPersonalized}
          className="group relative flex w-full items-center justify-between gap-4 overflow-hidden px-4 py-3.5 text-left transition-colors"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklch, var(--p-accent) 14%, transparent) 0%, color-mix(in oklch, var(--p-accent) 4%, transparent) 60%, transparent 100%)",
            border: "1px solid color-mix(in oklch, var(--p-accent) 45%, var(--p-rule))",
          }}
        >
          <div className="flex min-w-0 items-center gap-3.5">
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{
                background: "color-mix(in oklch, var(--p-accent) 18%, transparent)",
                border: "1px solid color-mix(in oklch, var(--p-accent) 55%, transparent)",
              }}
            >
              <Sparkles className="h-4 w-4" style={{ color: "var(--p-accent)" }} />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span
                  className="truncate text-[18px]"
                  style={{
                    fontFamily: "var(--font-instrument-serif)",
                    fontWeight: 400,
                    color: "var(--p-fg)",
                  }}
                >
                  Personalized
                </span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-[0.18em]"
                  style={{
                    fontFamily: "var(--font-jetbrains-mono)",
                    color: "var(--p-accent)",
                    background: "color-mix(in oklch, var(--p-accent) 14%, transparent)",
                    border: "1px solid color-mix(in oklch, var(--p-accent) 45%, transparent)",
                  }}
                >
                  NEW
                </span>
              </div>
              <div
                className="truncate text-[10px] uppercase tracking-[0.18em]"
                style={{
                  color: "var(--p-fg-mute)",
                  fontFamily: "var(--font-jetbrains-mono)",
                }}
              >
                Paste a lesson plan · we match the subtopics
              </div>
            </div>
          </div>
          <ChevronRight
            className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
            style={{ color: "var(--p-accent)" }}
          />
        </button>
      )}

      {/* Topic list */}
      <div className="flex w-full flex-col gap-2">
        {isLoading && (
          <div
            className="py-12 text-center text-[10px] uppercase tracking-[0.22em]"
            style={{
              color: "var(--p-fg-mute)",
              fontFamily: "var(--font-jetbrains-mono)",
            }}
          >
            LOADING TOPICS…
          </div>
        )}
        {!isLoading && topics.length === 0 && (
          <div
            className="py-12 text-center text-[10px] uppercase tracking-[0.22em]"
            style={{
              color: "var(--p-fg-mute)",
              fontFamily: "var(--font-jetbrains-mono)",
            }}
          >
            NO TOPICS AVAILABLE
          </div>
        )}
        {topics.map((topic) => {
          const isOpen = expandedTopicId === topic.id;
          return (
            <div
              key={topic.id}
              className="overflow-hidden"
              style={{
                background: "oklch(0.05 0.005 80 / 0.55)",
                border: "1px solid var(--p-rule)",
              }}
            >
              <button
                onClick={() => setExpandedTopicId(isOpen ? null : topic.id)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-[color:oklch(0.07_0.01_60_/_0.6)]"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div
                    className="truncate text-[18px]"
                    style={{
                      fontFamily: "var(--font-instrument-serif)",
                      fontWeight: 400,
                      color: "var(--p-fg)",
                    }}
                  >
                    {topic.name}
                  </div>
                  <div
                    className="text-[10px] uppercase tracking-[0.18em]"
                    style={{
                      color: "var(--p-fg-mute)",
                      fontFamily: "var(--font-jetbrains-mono)",
                    }}
                  >
                    {topic.subtopics.length} subtopic
                    {topic.subtopics.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform",
                    isOpen && "rotate-90",
                  )}
                  style={{ color: "var(--p-fg-mute)" }}
                />
              </button>

              {isOpen && (
                <div
                  className="flex flex-col"
                  style={{ borderTop: "1px solid var(--p-rule)" }}
                >
                  {topic.subtopics.map((st, idx) => {
                    const lastVisited = formatRelativeDay(st.lastVisitedAt);
                    const pct = progressPercent(st.stepsViewed, st.totalSteps);
                    return (
                      <div
                        key={`${st.id}-${st.slug}-${idx}`}
                        className="group flex flex-col transition-colors hover:bg-[color:oklch(0.07_0.01_60_/_0.6)] sm:flex-row sm:items-stretch"
                      >
                        <button
                          onClick={() => onPick(topic.slug, st.slug)}
                          className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2.5 text-left sm:px-5"
                        >
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <div
                              className="truncate text-sm"
                              title={st.name}
                              style={{
                                color: "var(--p-fg)",
                                fontFamily: "var(--font-jetbrains-mono)",
                              }}
                            >
                              {st.name}
                            </div>
                            <div
                              className="flex items-center gap-3 text-[10px] uppercase tracking-[0.18em]"
                              style={{
                                color: "var(--p-fg-mute)",
                                fontFamily: "var(--font-jetbrains-mono)",
                              }}
                            >
                              {st.difficulty && <span>{st.difficulty}</span>}
                              {st.estimatedMinutes != null && (
                                <span className="flex items-center gap-1">
                                  <Clock className="h-2.5 w-2.5" />
                                  {st.estimatedMinutes}m
                                </span>
                              )}
                              {st.completed ? (
                                <span
                                  className="flex items-center gap-1"
                                  style={{ color: "var(--p-accent)" }}
                                >
                                  <span
                                    aria-hidden
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ background: "var(--p-accent)" }}
                                  />
                                  Completed{lastVisited ? ` · ${lastVisited}` : ""}
                                </span>
                              ) : pct != null ? (
                                <span className="flex items-center gap-1">
                                  <span
                                    aria-hidden
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ background: "var(--p-fg-mute)" }}
                                  />
                                  {pct}%{lastVisited ? ` · ${lastVisited}` : ""}
                                </span>
                              ) : lastVisited ? (
                                <span>Opened {lastVisited}</span>
                              ) : null}
                            </div>
                          </div>
                          <ChevronRight
                            className="h-4 w-4 shrink-0 transition-colors"
                            style={{ color: "var(--p-fg-mute)" }}
                          />
                        </button>
                        {/* CTAs: a second row on mobile (even thirds, labels
                            shown), and the original inline border-l cluster on
                            desktop — `sm:contents` dissolves this wrapper at
                            >=640px so the buttons rejoin the row directly. */}
                        <div
                          className="flex border-t sm:contents"
                          style={{ borderColor: "var(--p-rule)" }}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onPickPodcast(st.id);
                            }}
                            aria-label={`Listen to a podcast about ${st.name}`}
                            title="Listen to podcast"
                            className="flex flex-1 items-center justify-center gap-1.5 border-l px-2.5 py-2.5 text-[10px] uppercase tracking-[0.22em] transition-colors first:border-l-0 hover:text-[color:var(--p-accent)] sm:flex-none sm:justify-start sm:py-0 sm:px-4 sm:first:border-l"
                            style={{
                              borderColor: "var(--p-rule)",
                              color: "var(--p-fg-mute)",
                              fontFamily: "var(--font-jetbrains-mono)",
                            }}
                          >
                            <Headphones className="h-3 w-3 shrink-0" />
                            <span className="hidden sm:inline">Podcast</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onPickInfographic(st.id);
                            }}
                            aria-label={`See an infographic about ${st.name}`}
                            title="See infographic"
                            className="flex flex-1 items-center justify-center gap-1.5 border-l px-2.5 py-2.5 text-[10px] uppercase tracking-[0.22em] transition-colors hover:text-[color:var(--p-accent)] sm:flex-none sm:justify-start sm:py-0 sm:px-4"
                            style={{
                              borderColor: "var(--p-rule)",
                              color: "var(--p-fg-mute)",
                              fontFamily: "var(--font-jetbrains-mono)",
                            }}
                          >
                            <ImageIcon className="h-3 w-3 shrink-0" />
                            <span className="hidden sm:inline">Poster</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onPickFlashcards(topic.slug, st.slug);
                            }}
                            aria-label={`Build a flashcard deck about ${st.name}`}
                            title="Build a flashcard deck"
                            className="flex flex-1 items-center justify-center gap-1.5 border-l px-2.5 py-2.5 text-[10px] uppercase tracking-[0.22em] transition-colors hover:text-[color:var(--p-accent)] sm:flex-none sm:justify-start sm:py-0 sm:px-4"
                            style={{
                              borderColor: "var(--p-rule)",
                              color: "var(--p-fg-mute)",
                              fontFamily: "var(--font-jetbrains-mono)",
                            }}
                          >
                            <Layers className="h-3 w-3 shrink-0" />
                            <span className="hidden sm:inline">Cards</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Animated SVG icons ────────────────────────────────────────────────

function IconLesson() {
  return (
    <svg viewBox="0 0 72 72" className="h-full w-full overflow-visible">
      <path d="M8 18 L36 24 L36 60 L8 54 Z" stroke="var(--p-fg-dim)" strokeWidth="1" strokeLinecap="round" fill="none" />
      <path d="M64 18 L36 24 L36 60 L64 54 Z" stroke="var(--p-fg-dim)" strokeWidth="1" strokeLinecap="round" fill="none" />
      <line x1="36" y1="24" x2="36" y2="60" stroke="var(--p-fg-faint)" strokeWidth="1" strokeLinecap="round" />
      <line x1="14" y1="32" x2="30" y2="35" stroke="var(--p-fg-faint)" strokeWidth="1" strokeLinecap="round" />
      <line x1="14" y1="38" x2="30" y2="41" stroke="var(--p-fg-faint)" strokeWidth="1" strokeLinecap="round" />
      <line x1="14" y1="44" x2="26" y2="46.5" stroke="var(--p-fg-faint)" strokeWidth="1" strokeLinecap="round" />
      <line x1="42" y1="35" x2="58" y2="32" stroke="var(--p-fg-faint)" strokeWidth="1" strokeLinecap="round" />
      <line x1="42" y1="41" x2="58" y2="38" stroke="var(--p-fg-faint)" strokeWidth="1" strokeLinecap="round" />
      <line x1="42" y1="46.5" x2="54" y2="44" stroke="var(--p-fg-faint)" strokeWidth="1" strokeLinecap="round" />
      <g className="page-turn">
        <path d="M36 24 Q 50 16, 62 22 L 62 56 Q 50 50, 36 58 Z" stroke="var(--accent-stroke,var(--p-accent-deep))" strokeWidth="1" strokeLinecap="round" fill="#000" />
        <line x1="42" y1="30" x2="56" y2="27" stroke="var(--accent-stroke,var(--p-accent-deep))" strokeWidth="1" strokeLinecap="round" />
        <line x1="42" y1="36" x2="56" y2="33" stroke="var(--accent-stroke,var(--p-accent-deep))" strokeWidth="1" strokeLinecap="round" />
        <line x1="42" y1="42" x2="52" y2="40" stroke="var(--accent-stroke,var(--p-accent-deep))" strokeWidth="1" strokeLinecap="round" />
      </g>
      <circle className="book-glint" cx="36" cy="22" r="1.6" fill="var(--accent-stroke,var(--p-accent-deep))" />
    </svg>
  );
}

function IconPractice() {
  return (
    <svg viewBox="0 0 72 72" className="h-full w-full overflow-visible">
      <g className="pulse-ring">
        <circle cx="36" cy="36" r="30" stroke="var(--p-fg-faint)" strokeWidth="1" fill="none" />
      </g>
      <circle cx="36" cy="36" r="22" stroke="var(--p-fg-dim)" strokeWidth="1" fill="none" />
      <circle cx="36" cy="36" r="13" stroke="var(--accent-stroke,var(--p-accent-deep))" strokeWidth="1" fill="none" />
      <g className="scan">
        <line x1="36" y1="36" x2="36" y2="14" stroke="var(--accent-stroke,var(--p-accent-deep))" strokeWidth="1" strokeDasharray="2 3" />
      </g>
      <line x1="6" y1="36" x2="14" y2="36" stroke="var(--accent-stroke,var(--p-accent-deep))" strokeWidth="1" />
      <line x1="58" y1="36" x2="66" y2="36" stroke="var(--accent-stroke,var(--p-accent-deep))" strokeWidth="1" />
      <line x1="36" y1="6" x2="36" y2="14" stroke="var(--accent-stroke,var(--p-accent-deep))" strokeWidth="1" />
      <line x1="36" y1="58" x2="36" y2="66" stroke="var(--accent-stroke,var(--p-accent-deep))" strokeWidth="1" />
      <g className="hit">
        <circle cx="36" cy="36" r="3" fill="var(--accent-stroke,var(--p-accent-deep))" />
      </g>
    </svg>
  );
}

function IconChat() {
  return (
    <svg viewBox="0 0 72 72" className="h-full w-full overflow-visible">
      <path
        d="M14 16 L52 16 Q60 16 60 24 L60 42 Q60 50 52 50 L34 50 L26 58 L26 50 L22 50 Q14 50 14 42 Z"
        stroke="var(--p-fg-faint)"
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M10 12 L48 12 Q56 12 56 20 L56 38 Q56 46 48 46 L30 46 L22 54 L22 46 L18 46 Q10 46 10 38 Z"
        stroke="var(--accent-stroke,var(--p-accent-deep))"
        strokeWidth="1"
        strokeLinecap="round"
        fill="#000"
      />
      <circle className="chat-dot d1" cx="22" cy="29" r="2.6" fill="var(--accent-stroke,var(--p-accent-deep))" />
      <circle className="chat-dot d2" cx="33" cy="29" r="2.6" fill="var(--accent-stroke,var(--p-accent-deep))" />
      <circle className="chat-dot d3" cx="44" cy="29" r="2.6" fill="var(--accent-stroke,var(--p-accent-deep))" />
    </svg>
  );
}
