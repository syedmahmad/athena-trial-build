"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Target, ArrowRight } from "lucide-react";

export function QuizCompletion({
  skillScore,
  totalQuestions,
  correctCount,
  onContinue,
}: {
  skillScore: number;
  totalQuestions: number;
  correctCount: number;
  onContinue: () => void;
}) {
  const scoreColor =
    skillScore >= 70
      ? "text-athena-success"
      : skillScore >= 40
        ? "text-athena-amber"
        : "text-destructive";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="w-full max-w-lg mx-auto text-center">
        <CardHeader>
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="mx-auto mb-2"
          >
            <Trophy className="h-12 w-12 text-athena-amber" />
          </motion.div>
          <CardTitle className="text-2xl">Quiz Complete!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <p className="text-sm text-muted-foreground mb-1">
              Your skill score
            </p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className={`text-5xl font-bold ${scoreColor}`}
            >
              {skillScore}
            </motion.p>
          </div>

          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Target className="h-4 w-4" />
              <span>
                {correctCount}/{totalQuestions} correct
              </span>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {skillScore >= 70
              ? "Strong foundation! Let's build a plan to push even higher."
              : skillScore >= 40
                ? "Good start! Your personalized lessons will help fill the gaps."
                : "No worries — we've queued targeted lessons to get you up to speed."}
          </p>

          <Button onClick={onContinue} className="w-full" size="lg">
            Set your study schedule
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
