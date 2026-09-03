"use client";

import { motion } from "framer-motion";
import type { LessonSection as LessonSectionType } from "@/lib/lesson-types";
import { Lightbulb, ListOrdered, BookOpen } from "lucide-react";

export function LessonSection({
  section,
  index,
}: {
  section: LessonSectionType;
  index: number;
}) {
  const icon = {
    explanation: <BookOpen className="h-5 w-5 text-athena-navy dark:text-athena-navy-light" />,
    walkthrough: <ListOrdered className="h-5 w-5 text-athena-amber" />,
    insight: <Lightbulb className="h-5 w-5 text-athena-success" />,
  }[section.type];

  const borderColor = {
    explanation: "border-l-athena-navy/30 dark:border-l-athena-navy-light/30",
    walkthrough: "border-l-athena-amber/30",
    insight: "border-l-athena-success/30",
  }[section.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.15, duration: 0.4 }}
      className={`border-l-4 ${borderColor} pl-4`}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
          {section.title}
        </h3>
      </div>

      {section.type === "walkthrough" ? (
        <ol className="space-y-2 ml-1">
          {section.steps.map((step, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.15 + i * 0.08 }}
              className="flex items-start gap-3 text-sm"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-athena-amber/10 text-xs font-medium text-athena-amber">
                {i + 1}
              </span>
              <span>{step}</span>
            </motion.li>
          ))}
        </ol>
      ) : (
        <p className="text-sm leading-relaxed">{section.content}</p>
      )}
    </motion.div>
  );
}
