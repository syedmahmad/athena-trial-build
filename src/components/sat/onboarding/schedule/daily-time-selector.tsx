"use client";

import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { DAYS } from "@/lib/schedule-utils";

type DayOfWeek = (typeof DAYS)[number]["key"];

const DAY_LETTERS: { key: DayOfWeek; letter: string }[] = [
  { key: "monday", letter: "M" },
  { key: "tuesday", letter: "T" },
  { key: "wednesday", letter: "W" },
  { key: "thursday", letter: "T" },
  { key: "friday", letter: "F" },
  { key: "saturday", letter: "S" },
  { key: "sunday", letter: "S" },
];

function formatTime(hour: number, minute: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const h = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h}:${String(minute).padStart(2, "0")} ${period}`;
}

function generateTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      options.push({ value, label: formatTime(h, m) });
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

const DEFAULT_DAYS: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
];

function addHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function DailyTimeSelector() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeDays, setActiveDays] = useState<Set<DayOfWeek>>(
    new Set(DEFAULT_DAYS)
  );
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const toggleDay = useCallback((day: DayOfWeek) => {
    setActiveDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }, []);

  const handleSubmit = async () => {
    if (activeDays.size === 0) {
      toast.error("Please select at least one day.");
      return;
    }
    if (!selectedTime) {
      toast.error("Please select a time.");
      return;
    }

    const slots = Array.from(activeDays).map((day) => ({
      dayOfWeek: day,
      startTime: selectedTime,
      endTime: addHour(selectedTime),
    }));

    setSubmitting(true);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slots,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");

      // /api/schedule no longer flips onboarding state itself; mark the flow
      // complete explicitly so the dashboard stops bouncing back here.
      const done = await fetch("/api/onboarding/complete", { method: "POST" });
      if (!done.ok) throw new Error("Failed to save");

      // The cached user still says onboardingCompleted=false; refetch so the
      // dashboard doesn't bounce back into the flow.
      queryClient.invalidateQueries({ queryKey: ["user"] });

      toast.success("Schedule saved!");
      router.push("/sat/onboarding/complete");
    } catch {
      toast.error("Failed to save schedule. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const skipMutation = useMutation({
    mutationFn: () =>
      fetch("/api/onboarding/complete", { method: "POST" }).then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
      router.push("/sat/onboarding/complete");
    },
    onError: () => toast.error("Something went wrong. Please try again."),
  });

  const handleSkip = () => skipMutation.mutate();

  return (
    <div className="flex w-full max-w-lg flex-col items-center px-4 py-8">
      {/* Clock icon */}
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <Clock className="h-7 w-7 text-muted-foreground" />
      </div>

      {/* Heading */}
      <h1 className="mb-2 text-center text-3xl font-bold tracking-tight">
        Set Your Daily Time
      </h1>
      <p className="mb-1 text-center text-muted-foreground">
        Pick a time and days you can show up consistently.
      </p>
      <p className="mb-8 text-center text-sm text-muted-foreground">
        ⚡ Students who set a fixed schedule score 2× faster
      </p>

      {/* Day circles */}
      <div className="mb-8 flex gap-2">
        {DAY_LETTERS.map((day) => {
          const isActive = activeDays.has(day.key);
          return (
            <button
              key={day.key}
              onClick={() => toggleDay(day.key)}
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all",
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground/40"
              )}
            >
              {day.letter}
            </button>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="mb-8 max-h-72 w-full overflow-y-auto overscroll-contain rounded-xl">
        <div className="grid grid-cols-3 gap-3">
          {TIME_OPTIONS.map((time) => {
            const isSelected = selectedTime === time.value;
            return (
              <button
                key={time.value}
                onClick={() => setSelectedTime(time.value)}
                className={cn(
                  "rounded-xl border px-4 py-3 text-sm font-medium transition-all",
                  isSelected
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground/40"
                )}
              >
                {time.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={submitting || activeDays.size === 0 || !selectedTime}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-muted py-4 text-base font-semibold text-foreground transition-colors hover:bg-muted/80 disabled:opacity-50"
      >
        <Swords className="h-5 w-5" />
        {submitting ? "Saving..." : "Start Your Quest"}
      </button>

      {/* Skip button */}
      <button
        onClick={handleSkip}
        className="flex w-full items-center justify-center rounded-2xl border border-border py-4 text-base font-semibold text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
      >
        Skip for now
      </button>
    </div>
  );
}
