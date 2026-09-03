"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ProgressStepper } from "@/components/sat/onboarding/progress-stepper";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight } from "lucide-react";

export default function CompletePage() {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center gap-8">
      <ProgressStepper currentStep="completed" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        <Card className="text-center">
          <CardHeader>
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                delay: 0.2,
                type: "spring",
                stiffness: 200,
                damping: 15,
              }}
              className="mx-auto mb-2"
            >
              <Sparkles className="h-14 w-14 text-athena-amber" />
            </motion.div>
            <CardTitle className="text-2xl">You&apos;re all set!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-muted-foreground"
            >
              Your personalized study plan is ready. Your sessions are
              scheduled, and your learning queue is loaded with targeted
              lessons.
            </motion.p>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-sm text-muted-foreground"
            >
              Remember: consistency compounds more than intensity.
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              <Button
                size="lg"
                className="w-full"
                onClick={() => router.push("/sat/dashboard")}
              >
                Go to Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
