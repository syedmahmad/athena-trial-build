import { supabase } from "@/lib/supabase/client";

function mapSession(row: {
  id: string;
  user_id: string;
  schedule_id: string;
  scheduled_date: string;
  status: string;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: row.id,
    userId: row.user_id,
    scheduleId: row.schedule_id,
    scheduledDate: row.scheduled_date,
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function createSessions(
  items: {
    userId: string;
    scheduleId: string;
    scheduledDate: string;
  }[]
) {
  if (items.length === 0) return [];
  const { data } = await supabase
    .from("sessions")
    .insert(items.map((s) => ({
      user_id: s.userId,
      schedule_id: s.scheduleId,
      scheduled_date: s.scheduledDate,
    })))
    .select();

  return (data ?? []).map(mapSession);
}

export async function getUserSessions(userId: string) {
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", userId)
    .order("scheduled_date", { ascending: true });

  return (data ?? []).map(mapSession);
}

export async function getUpcomingSessions(userId: string, limit: number = 5) {
  const today = new Date().toISOString().split("T")[0];
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", userId)
    .gte("scheduled_date", today)
    .order("scheduled_date", { ascending: true })
    .limit(limit);

  return (data ?? []).map(mapSession);
}

export async function getRecentSessions(userId: string, limit: number = 10) {
  const { data } = await supabase
    .from("sessions")
    .select("*")
    .eq("user_id", userId)
    .order("scheduled_date", { ascending: false })
    .limit(limit);

  return (data ?? []).map(mapSession);
}

export async function deleteFuturePendingSessions(userId: string) {
  const today = new Date().toISOString().split("T")[0];
  await supabase
    .from("sessions")
    .delete()
    .eq("user_id", userId)
    .gte("scheduled_date", today)
    .eq("status", "pending");
}
