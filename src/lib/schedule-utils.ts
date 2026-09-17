type DayOfWeek =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

const DAY_INDEX: Record<DayOfWeek, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function generateSessionDates(
  schedules: { dayOfWeek: DayOfWeek; id: string }[],
  weeksAhead: number = 4
): { scheduleId: string; scheduledDate: string }[] {
  const sessions: { scheduleId: string; scheduledDate: string }[] = [];
  // UTC-anchored throughout (see the identical fix + full explanation in
  // getDashboardData, lib/db/queries/dashboard.ts) — local setHours(0,0,0,0)
  // followed by toISOString() shifts every generated date back by one day
  // on a positive-UTC-offset server (local midnight serializes to the
  // *previous* UTC calendar day), so a student's Wednesday schedule slot
  // was generating session rows dated Tuesday.
  const today = new Date(new Date().toISOString().split("T")[0]);

  for (const schedule of schedules) {
    const targetDay = DAY_INDEX[schedule.dayOfWeek];

    for (let week = 0; week < weeksAhead; week++) {
      const date = new Date(today);
      // Find the next occurrence of the target day
      const currentDay = date.getUTCDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      date.setUTCDate(date.getUTCDate() + daysUntil + week * 7);

      sessions.push({
        scheduleId: schedule.id,
        scheduledDate: date.toISOString().split("T")[0],
      });
    }
  }

  return sessions.sort(
    (a, b) =>
      new Date(a.scheduledDate).getTime() -
      new Date(b.scheduledDate).getTime()
  );
}

export function calculateWeeklyMinutes(
  slots: { startTime: string; endTime: string }[]
): number {
  return slots.reduce((total, slot) => {
    const [startH, startM] = slot.startTime.split(":").map(Number);
    const [endH, endM] = slot.endTime.split(":").map(Number);
    const minutes = (endH * 60 + endM) - (startH * 60 + startM);
    return total + Math.max(0, minutes);
  }, 0);
}

export const DAYS: { key: DayOfWeek; label: string; short: string }[] = [
  { key: "monday", label: "Monday", short: "Mon" },
  { key: "tuesday", label: "Tuesday", short: "Tue" },
  { key: "wednesday", label: "Wednesday", short: "Wed" },
  { key: "thursday", label: "Thursday", short: "Thu" },
  { key: "friday", label: "Friday", short: "Fri" },
  { key: "saturday", label: "Saturday", short: "Sat" },
  { key: "sunday", label: "Sunday", short: "Sun" },
];
