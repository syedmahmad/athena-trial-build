"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  Target,
  Lightbulb,
  AlertTriangle,
  Sparkles,
  ClipboardList,
  ArrowRight,
  Zap,
} from "lucide-react";
import { useMyLearningTopic } from "@/hooks/use-my-learning-topic";

type CustomTopic = {
  id: string;
  title: string;
  description: string;
  learningObjectives: string[];
  tipsAndTricks: string[];
  commonMistakes: { mistake: string; correction: string; why: string }[];
};

type CustomQuestion = {
  id: string;
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function MyLearningTopicPage() {
  const params = useParams<{ topicId: string }>();

  const { data, isLoading } = useMyLearningTopic(params.topicId);

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

  const topic: CustomTopic = data.topic;
  const questions: CustomQuestion[] = data.questions;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">

      {/* Back */}
      <Link
        href="/my-learning"
        className="inline-flex items-center gap-1.5 text-sm font-medium uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ChevronLeft className="h-5 w-5" />
        My Learning
      </Link>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <div className="inline-flex items-center gap-1.5 border border-athena-amber/30 bg-athena-amber/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-athena-amber mb-3">
          <Zap className="h-2.5 w-2.5" />
          Mission Briefing
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-3">{topic.title}</h1>
        <p className="text-muted-foreground leading-relaxed">
          {topic.description}
        </p>
      </motion.div>

      {/* Action cards */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        className="grid grid-cols-2 gap-3 mb-10"
      >
        <Link href={`/my-learning/${params.topicId}/micro-lesson`} className="block">
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

        {questions.length > 0 ? (
          <Link href={`/my-learning/${params.topicId}/quiz`} className="block">
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
              <p className="text-xs text-muted-foreground mb-4">{questions.length} questions — timed practice</p>
              <div className="flex items-center gap-1 text-xs font-semibold text-primary">
                Enter <ArrowRight className="h-3 w-3" />
              </div>
            </motion.div>
          </Link>
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
        {topic.learningObjectives.length > 0 && (
          <motion.div variants={fadeUp} className="border bg-card">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/30">
              <div className="flex h-6 w-6 items-center justify-center bg-green-500/10">
                <Target className="h-3.5 w-3.5 text-green-500" />
              </div>
              <h2 className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Objectives</h2>
              <span className="ml-auto text-xs font-bold text-green-500">{topic.learningObjectives.length}</span>
            </div>
            <ul className="p-5 space-y-3">
              {topic.learningObjectives.map((obj, i) => (
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

        {/* Tips & Tricks */}
        {topic.tipsAndTricks.length > 0 && (
          <motion.div variants={fadeUp} className="border bg-card">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/30">
              <div className="flex h-6 w-6 items-center justify-center bg-athena-amber/10">
                <Lightbulb className="h-3.5 w-3.5 text-athena-amber" />
              </div>
              <h2 className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Power-Ups</h2>
              <span className="ml-auto text-xs font-bold text-athena-amber">{topic.tipsAndTricks.length}</span>
            </div>
            <ul className="p-5 space-y-3">
              {topic.tipsAndTricks.map((tip, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 bg-athena-amber" />
                  {tip}
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* Common Mistakes */}
        {topic.commonMistakes.length > 0 && (
          <motion.div variants={fadeUp} className="border bg-card">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-destructive/5">
              <div className="flex h-6 w-6 items-center justify-center bg-destructive/10">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              </div>
              <h2 className="font-bold text-xs uppercase tracking-widest text-muted-foreground">Danger Zones</h2>
              <span className="ml-auto text-xs font-bold text-destructive">{topic.commonMistakes.length}</span>
            </div>
            <div className="p-5 space-y-3">
              {topic.commonMistakes.map((m, i) => (
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
