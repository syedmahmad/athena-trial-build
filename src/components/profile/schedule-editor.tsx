"use client";

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

type ScheduleSlot = {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
};

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

function formatTimeStr(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return formatTime(h, m);
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

function addHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function ScheduleEditor() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [activeDays, setActiveDays] = useState<Set<DayOfWeek>>(new Set());
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ schedules: ScheduleSlot[] }>({
    queryKey: ["profile-schedule"],
    queryFn: () =>
      fetch("/api/profile/schedule").then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      }),
    staleTime: 5 * 60_000,
  });

  const schedules = data?.schedules ?? [];

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

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      // Initialize editor state from current schedule
      const days = new Set<DayOfWeek>(
        schedules.map((s) => s.dayOfWeek as DayOfWeek)
      );
      setActiveDays(days);
      setSelectedTime(schedules[0]?.startTime ?? null);
    }
    setOpen(isOpen);
  };

  const mutation = useMutation({
    mutationFn: (slots: { dayOfWeek: string; startTime: string; endTime: string }[]) =>
      fetch("/api/profile/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slots,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      }).then((r) => {
        if (!r.ok) throw new Error("Failed to save");
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Schedule updated!");
      setOpen(false);
    },
    onError: () => {
      toast.error("Failed to update schedule");
    },
  });

  const handleSave = () => {
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
    mutation.mutate(slots);
  };

  // Compact summary display
  const activeDayKeys = new Set(schedules.map((s) => s.dayOfWeek));
  const timeLabel = schedules[0]
    ? formatTimeStr(schedules[0].startTime)
    : null;

  return (
    <div className="border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Study Schedule
        </h3>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Schedule</DialogTitle>
            </DialogHeader>

            {/* Day circles */}
            <div className="flex justify-center gap-2">
              {DAY_LETTERS.map((day) => {
                const isActive = activeDays.has(day.key);
                return (
                  <button
                    key={day.key}
                    onClick={() => toggleDay(day.key)}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all",
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
            <div className="max-h-60 overflow-y-auto overscroll-contain">
              <div className="grid grid-cols-3 gap-2">
                {TIME_OPTIONS.map((time) => {
                  const isSelected = selectedTime === time.value;
                  return (
                    <button
                      key={time.value}
                      onClick={() => setSelectedTime(time.value)}
                      className={cn(
                        "rounded-xl border px-3 py-2.5 text-sm font-medium transition-all",
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

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={mutation.isPending || activeDays.size === 0 || !selectedTime}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-muted py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted/80 disabled:opacity-50"
            >
              {mutation.isPending ? "Saving..." : "Save Schedule"}
            </button>
          </DialogContent>
        </Dialog>
      </div>

      {/* Compact schedule display */}
      {isLoading ? (
        <div className="mt-3 h-10 animate-pulse bg-muted" />
      ) : schedules.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No schedule set</p>
      ) : (
        <div className="mt-3">
          <div className="flex gap-1.5">
            {DAY_LETTERS.map((day) => (
              <div
                key={day.key}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                  activeDayKeys.has(day.key)
                    ? "bg-foreground text-background"
                    : "text-muted-foreground/30"
                )}
              >
                {day.letter}
              </div>
            ))}
          </div>
          {timeLabel && (
            <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {timeLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
