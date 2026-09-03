"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Lightbulb } from "lucide-react";

type AnswerState =
  | { type: "unanswered" }
  | { type: "correct"; correctOption: number }
  | { type: "wrong"; selectedOption: number; correctOption: number; explanation: string };

export function ExplanationPanel({
  answerState,
  options,
}: {
  answerState: AnswerState;
  options?: string[];
}) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-4 w-4" />
          Explanation
        </CardTitle>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait">
          {answerState.type === "unanswered" && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground"
            >
              <Lightbulb className="mb-3 h-8 w-8 opacity-30" />
              <p className="text-sm">
                Select an answer to see the explanation.
              </p>
            </motion.div>
          )}

          {answerState.type === "correct" && (
            <motion.div
              key="correct"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 rounded-lg border border-athena-success/30 bg-athena-success/5 p-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-athena-success" />
                <div>
                  <p className="font-semibold text-athena-success">Correct!</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Great job — you got this one right.
                  </p>
                </div>
              </div>
              {options && (
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Correct answer
                  </p>
                  <p className="text-sm font-medium">
                    {String.fromCharCode(65 + answerState.correctOption)}.{" "}
                    {options[answerState.correctOption]}
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {answerState.type === "wrong" && (
            <motion.div
              key="wrong"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-semibold text-destructive">Incorrect</p>
                  {options && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      You selected{" "}
                      <span className="font-medium text-foreground">
                        {String.fromCharCode(65 + answerState.selectedOption)}.{" "}
                        {options[answerState.selectedOption]}
                      </span>
                    </p>
                  )}
                </div>
              </div>

              {options && (
                <div className="rounded-lg border border-athena-success/20 bg-athena-success/5 p-3">
                  <p className="text-xs font-medium text-athena-success mb-1">
                    Correct answer
                  </p>
                  <p className="text-sm font-medium">
                    {String.fromCharCode(65 + answerState.correctOption)}.{" "}
                    {options[answerState.correctOption]}
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-athena-amber/30 bg-athena-amber/5 p-4">
                <p className="text-sm font-medium text-athena-amber mb-1">
                  Why?
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {answerState.explanation}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
