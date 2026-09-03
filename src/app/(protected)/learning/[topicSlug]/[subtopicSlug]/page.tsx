"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  Clock,
  Target,
  Lightbulb,
  AlertTriangle,
  Sparkles,
  ClipboardList,
  ArrowRight,
  BookOpen,
  BookText,
  FlaskConical,
} from "lucide-react";

type ConceptualOverview = {
  definition: string;
  realWorldExample: string;
  satContext: string;
  visualDescription: string;
};

type KeyFormula = { latex: string; description: string };
type CommonMistake = { mistake: string; correction: string; why: string };
type SolutionStep = { step: number; instruction: string; math: string };

type Subtopic = {
  id: string;
  slug: string;
  name: string;
  description: string;
  difficulty: string;
  estimatedMinutes: number;
  learningObjectives: string[];
  keyFormulas: KeyFormula[];
  commonMistakes: CommonMistake[];
  tipsAndTricks: string[];
  conceptualOverview: ConceptualOverview;
};

type Problem = {
  id: string;
  orderIndex: number;
  difficulty: string;
  questionText: string;
  options: string[];
  correctOption: number;
  explanation: string;
  solutionSteps: SolutionStep[];
  hint: string;
  timeRecommendationSeconds: number;
};

type PageData = {
  topic: { slug: string; name: string; subject: string };
  subtopic: Subtopic;
  problems: Problem[];
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function SubtopicPage() {
  const params = useParams<{ topicSlug: string; subtopicSlug: string }>();
  const router = useRouter();

  const { data, isLoading, isError } = useQuery<PageData>({
    queryKey: ["learning", params.topicSlug, params.subtopicSlug],
    queryFn: () =>
      fetch(`/api/learning/${params.topicSlug}/${params.subtopicSlug}`).then(
        (r) => {
          if (!r.ok) throw new Error("Failed to load");
          return r.json();
        }
      ),
    staleTime: 600_000,
  });

  useEffect(() => {
    if (isError) toast.error("Failed to load subtopic");
  }, [isError]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div className="h-5 w-28 bg-muted animate-pulse" />
        <div className="h-9 w-72 bg-muted animate-pulse" />
        <div className="h-24 bg-muted animate-pulse" />
        <div className="h-40 bg-muted animate-pulse" />
        <div className="h-40 bg-muted animate-pulse" />
      </div>
    );
  }

  if (!data) return null;

  const { topic, subtopic, problems } = data;
  // SAT-specific framing only shows for the SAT subjects; general academic
  // subjects (science, social-studies) drop it.
  const isSat = topic.subject === "math" || topic.subject === "reading-writing";

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">

      {/* Back */}
      <Link
        href={`/learning/${params.topicSlug}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ChevronLeft className="h-5 w-5" />
        {topic.name}
      </Link>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <div className="inline-flex items-center gap-1.5 border border-primary/30 bg-primary/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-primary mb-3">
          <BookOpen className="h-2.5 w-2.5" />
          Study Topic
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-3">{subtopic.name}</h1>
        <p className="text-muted-foreground leading-relaxed mb-2">
          {subtopic.description}
        </p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {subtopic.estimatedMinutes} min
        </div>
      </motion.div>

      {/* Action cards */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        className="grid gap-3 mb-10 grid-cols-1 sm:grid-cols-2"
      >
        <Link href={`/learning/${params.topicSlug}/${subtopic.slug}/micro-lesson`} className="block">
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="group relative h-full border-2 border-athena-amber/40 bg-gradient-to-b from-athena-amber/10 to-transparent p-5 cursor-pointer transition-colors hover:border-athena-amber"
          >
            <Sparkles className="absolute right-4 top-4 h-3.5 w-3.5 text-athena-amber/30 group-hover:text-athena-amber/60 transition-colors" />
            <div className="mb-4 flex h-10 w-10 items-center justify-center bg-athena-amber/15">
              <Sparkles className="h-5 w-5 text-athena-amber" />
            </div>
            <p className="font-bold text-sm uppercase tracking-wide mb-1">Micro-Lesson</p>
            <p className="text-xs text-muted-foreground mb-4">Interactive lesson with whiteboard</p>
            <div className="flex items-center gap-1 text-xs font-semibold text-athena-amber">
              Start <ArrowRight className="h-3 w-3" />
            </div>
          </motion.div>
        </Link>

        {problems.length > 0 ? (
          <button onClick={() => router.push(`/learning/${params.topicSlug}/${params.subtopicSlug}/quiz`)} className="block text-left w-full">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="group relative h-full border-2 border-primary/40 bg-gradient-to-b from-primary/10 to-transparent p-5 cursor-pointer transition-colors hover:border-primary"
            >
              <ClipboardList className="absolute right-4 top-4 h-3.5 w-3.5 text-primary/30 group-hover:text-primary/60 transition-colors" />
              <div className="mb-4 flex h-10 w-10 items-center justify-center bg-primary/15">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <p className="font-bold text-sm uppercase tracking-wide mb-1">Take Quiz</p>
              <p className="text-xs text-muted-foreground mb-4">{problems.length} questions — {isSat ? "SAT-style practice" : "practice problems"}</p>
              <div className="flex items-center gap-1 text-xs font-semibold text-primary">
                Enter <ArrowRight className="h-3 w-3" />
              </div>
            </motion.div>
          </button>
        ) : (
          <div className="h-full border-2 border-dashed border-muted-foreground/20 p-5 flex items-center justify-center">
            <p className="text-xs text-muted-foreground text-center">Quiz loading…</p>
          </div>
        )}
      </motion.div>

      {/* Content sections */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="space-y-3"
      >
        {/* Learning Objectives */}
        {subtopic.learningObjectives.length > 0 && (
          <motion.div variants={fadeUp} className="border bg-card">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/30">
              <div className="flex h-6 w-6 items-center justify-center bg-green-500/10">
                <Target className="h-3.5 w-3.5 text-green-500" />
              </div>
              <h2 className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Objectives</h2>
              <span className="ml-auto text-xs font-bold text-green-500">{subtopic.learningObjectives.length}</span>
            </div>
            <ul className="p-5 space-y-3">
              {subtopic.learningObjectives.map((obj, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <span className="shrink-0 mt-0.5 flex h-5 w-5 items-center justify-center bg-green-500/10 text-[10px] font-bold text-green-500">
                    {i + 1}
                  </span>
                  {obj}
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* Conceptual Overview */}
        <motion.div variants={fadeUp} className="border bg-card">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/30">
            <div className="flex h-6 w-6 items-center justify-center bg-blue-500/10">
              <BookText className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <h2 className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Conceptual Overview</h2>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Definition</h4>
              <p className="text-sm text-muted-foreground">{subtopic.conceptualOverview.definition}</p>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Real-World Example</h4>
              <p className="text-sm text-muted-foreground">{subtopic.conceptualOverview.realWorldExample}</p>
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5">{isSat ? "On the SAT" : "Why It Matters"}</h4>
              <p className="text-sm text-muted-foreground">{subtopic.conceptualOverview.satContext}</p>
            </div>
          </div>
        </motion.div>

        {/* Key Formulas */}
        {subtopic.keyFormulas.length > 0 && (
          <motion.div variants={fadeUp} className="border bg-card">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/30">
              <div className="flex h-6 w-6 items-center justify-center bg-purple-500/10">
                <FlaskConical className="h-3.5 w-3.5 text-purple-500" />
              </div>
              <h2 className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Key Formulas</h2>
              <span className="ml-auto text-xs font-bold text-purple-500">{subtopic.keyFormulas.length}</span>
            </div>
            <div className="p-5 space-y-3">
              {subtopic.keyFormulas.map((f, i) => (
                <div key={i} className="bg-purple-500/5 px-4 py-3">
                  <code className="text-sm font-mono text-purple-600 dark:text-purple-400">{f.latex}</code>
                  <p className="mt-1 text-xs text-muted-foreground">{f.description}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Tips & Tricks */}
        {subtopic.tipsAndTricks.length > 0 && (
          <motion.div variants={fadeUp} className="border bg-card">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/30">
              <div className="flex h-6 w-6 items-center justify-center bg-athena-amber/10">
                <Lightbulb className="h-3.5 w-3.5 text-athena-amber" />
              </div>
              <h2 className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Power-Ups</h2>
              <span className="ml-auto text-xs font-bold text-athena-amber">{subtopic.tipsAndTricks.length}</span>
            </div>
            <ul className="p-5 space-y-3">
              {subtopic.tipsAndTricks.map((tip, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-athena-amber" />
                  {tip}
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* Common Mistakes */}
        {subtopic.commonMistakes.length > 0 && (
          <motion.div variants={fadeUp} className="border bg-card">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-destructive/5">
              <div className="flex h-6 w-6 items-center justify-center bg-destructive/10">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              </div>
              <h2 className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Danger Zones</h2>
              <span className="ml-auto text-xs font-bold text-destructive">{subtopic.commonMistakes.length}</span>
            </div>
            <div className="p-5 space-y-3">
              {subtopic.commonMistakes.map((m, i) => (
                <div key={i} className="bg-destructive/5 px-4 py-3 space-y-1.5">
                  <p className="text-sm font-semibold text-destructive">{m.mistake}</p>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-green-600 dark:text-green-400">Fix: </span>
                    {m.correction}
                  </p>
                  <p className="text-xs text-muted-foreground italic">{m.why}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
