"use client";

import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight } from "lucide-react";

export function LessonCompleteCard({
  onContinue,
  continueLabel = "Continue",
}: {
  onContinue: () => void;
  continueLabel?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-athena-success/30 bg-athena-success/5">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-athena-success" />
            <span className="text-sm font-medium">Lesson complete!</span>
          </div>
          <Button size="sm" onClick={onContinue}>
            {continueLabel}
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
