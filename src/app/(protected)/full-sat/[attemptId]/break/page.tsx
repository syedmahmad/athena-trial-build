"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Coffee, ArrowRight, Clock } from "lucide-react";

export default function FullSatBreakPage() {
  const router = useRouter();
  const params = useParams<{ attemptId: string }>();
  const [breakTime, setBreakTime] = useState(0); // seconds spent on break

  useEffect(() => {
    const timer = setInterval(() => setBreakTime((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleContinue = () => {
    // Navigate to first math question (question 55)
    router.push(`/full-sat/${params.attemptId}/55`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mx-auto max-w-md px-6 text-center"
      >
        <div className="mb-6 flex items-center justify-center">
          <div className="rounded-full bg-primary/10 p-4">
            <Coffee className="h-8 w-8 text-primary" />
          </div>
        </div>

        <h1 className="text-2xl font-bold tracking-tight">Section Break</h1>
        <p className="mt-2 text-muted-foreground">
          You&apos;ve completed the Reading &amp; Writing section.
          Take a moment to rest before starting Math.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Break time: {formatTime(breakTime)}</span>
        </div>

        <div className="mt-4 rounded-lg border bg-card p-4">
          <p className="text-sm font-medium">Up Next</p>
          <p className="text-xs text-muted-foreground mt-1">
            Math Section: 44 questions, 70 minutes (Module 1 + Module 2)
          </p>
        </div>

        <button
          onClick={handleContinue}
          className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Continue to Math
          <ArrowRight className="h-4 w-4" />
        </button>
      </motion.div>
    </div>
  );
}
