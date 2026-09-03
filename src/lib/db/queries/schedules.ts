import { supabase } from "@/lib/supabase/client";

function mapSchedule(row: {
  id: string;
  user_id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: row.id,
    userId: row.user_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function createSchedules(
  items: {
    userId: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
  }[]
) {
  if (items.length === 0) return [];
  const { data } = await supabase
    .from("schedules")
    .insert(items.map((s) => ({
      user_id: s.userId,
      day_of_week: s.dayOfWeek,
      start_time: s.startTime,
      end_time: s.endTime,
    })))
    .select();

  return (data ?? []).map(mapSchedule);
}

export async function getUserSchedules(userId: string) {
  const { data } = await supabase
    .from("schedules")
    .select("*")
    .eq("user_id", userId);

  return (data ?? []).map(mapSchedule);
}

export async function deleteUserSchedules(userId: string) {
  await supabase.from("schedules").delete().eq("user_id", userId);
}
