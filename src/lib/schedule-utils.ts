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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const schedule of schedules) {
    const targetDay = DAY_INDEX[schedule.dayOfWeek];

    for (let week = 0; week < weeksAhead; week++) {
      const date = new Date(today);
      // Find the next occurrence of the target day
      const currentDay = date.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      date.setDate(date.getDate() + daysUntil + week * 7);

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
