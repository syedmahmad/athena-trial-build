import { supabase } from "@/lib/supabase/client";
import type { Challenge, ChallengeAttempt, ChallengeStatus } from "@/types/challenges";
import { CHALLENGE_EXPIRY_GRACE_MS } from "@/types/challenges";

type ChallengeRow = {
  id: string;
  challenger_id: string;
  opponent_id: string;
  subtopic_id: string;
  question_count: number;
  problem_ids: unknown;
  scheduled_at: string;
  status: ChallengeStatus;
  winner_id: string | null;
  created_at: string;
};

/** Expiry is derived at read time, not cron-driven — see plan doc. */
function deriveStatus(row: ChallengeRow): ChallengeStatus {
  const scheduledMs = new Date(row.scheduled_at).getTime();
  const now = Date.now();
  if (row.status === "pending" && now > scheduledMs) return "expired";
  if (row.status === "scheduled" && now > scheduledMs + CHALLENGE_EXPIRY_GRACE_MS) return "expired";
  return row.status;
}

async function attachNames(rows: ChallengeRow[]): Promise<Challenge[]> {
  if (rows.length === 0) return [];
  const userIds = Array.from(new Set(rows.flatMap((r) => [r.challenger_id, r.opponent_id])));
  const subtopicIds = Array.from(new Set(rows.map((r) => r.subtopic_id)));

  const [usersRes, subtopicsRes] = await Promise.all([
    supabase.from("users").select("id, display_name").in("id", userIds),
    supabase.from("subtopics").select("id, name").in("id", subtopicIds),
  ]);

  const userNames = new Map((usersRes.data ?? []).map((u) => [u.id, u.display_name]));
  const subtopicNames = new Map((subtopicsRes.data ?? []).map((s) => [s.id, s.name]));

  return rows.map((r) => ({
    id: r.id,
    challengerId: r.challenger_id,
    opponentId: r.opponent_id,
    subtopicId: r.subtopic_id,
    questionCount: r.question_count,
    scheduledAt: r.scheduled_at,
    status: deriveStatus(r),
    winnerId: r.winner_id,
    createdAt: r.created_at,
    challengerName: userNames.get(r.challenger_id) ?? null,
    opponentName: userNames.get(r.opponent_id) ?? null,
    subtopicName: subtopicNames.get(r.subtopic_id) ?? null,
    topicName: null,
  }));
}

async function attachAttempts(
  challenges: Challenge[]
): Promise<(Challenge & { attempts: ChallengeAttempt[] })[]> {
  if (challenges.length === 0) return [];
  const ids = challenges.map((c) => c.id);
  const { data } = await supabase
    .from("quiz_challenge_attempts")
    .select("id, challenge_id, user_id, score, time_elapsed_seconds, submitted_at")
    .in("challenge_id", ids);

  const byChallenge = new Map<string, ChallengeAttempt[]>();
  for (const row of data ?? []) {
    const list = byChallenge.get(row.challenge_id) ?? [];
    list.push({
      id: row.id,
      challengeId: row.challenge_id,
      userId: row.user_id,
      score: row.score,
      timeElapsedSeconds: row.time_elapsed_seconds,
      submittedAt: row.submitted_at,
    });
    byChallenge.set(row.challenge_id, list);
  }

  return challenges.map((c) => ({ ...c, attempts: byChallenge.get(c.id) ?? [] }));
}

/** Best-effort: persist any newly-derived 'expired' status so future reads
 *  (and the opponent/challenger indexes) don't have to re-derive it. */
async function persistExpiries(rows: ChallengeRow[], derived: Challenge[]) {
  const toExpire = rows
    .filter((r, i) => derived[i].status === "expired" && r.status !== "expired")
    .map((r) => r.id);
  if (toExpire.length > 0) {
    void supabase.from("quiz_challenges").update({ status: "expired" }).in("id", toExpire);
  }
}

export async function getChallengesForUser(userId: string) {
  const { data } = await supabase
    .from("quiz_challenges")
    .select("*")
    .or(`challenger_id.eq.${userId},opponent_id.eq.${userId}`)
    .order("scheduled_at", { ascending: true });

  const rows = (data ?? []) as ChallengeRow[];
  const challenges = await attachNames(rows);
  await persistExpiries(rows, challenges);

  const incoming = challenges.filter((c) => c.opponentId === userId && c.status === "pending");
  const outgoing = challenges.filter((c) => c.challengerId === userId && c.status === "pending");
  const scheduled = challenges.filter((c) => c.status === "scheduled");
  const completed = await attachAttempts(challenges.filter((c) => c.status === "completed"));

  return { incoming, outgoing, scheduled, completed };
}

export async function getChallengeById(challengeId: string) {
  const { data } = await supabase
    .from("quiz_challenges")
    .select("*")
    .eq("id", challengeId)
    .maybeSingle();

  if (!data) return null;
  const row = data as ChallengeRow;
  const [challenge] = await attachNames([row]);
  await persistExpiries([row], [challenge]);

  const { data: attemptRows } = await supabase
    .from("quiz_challenge_attempts")
    .select("id, challenge_id, user_id, score, time_elapsed_seconds, submitted_at")
    .eq("challenge_id", challengeId);

  const attempts: ChallengeAttempt[] = (attemptRows ?? []).map((r) => ({
    id: r.id,
    challengeId: r.challenge_id,
    userId: r.user_id,
    score: r.score,
    timeElapsedSeconds: r.time_elapsed_seconds,
    submittedAt: r.submitted_at,
  }));

  return { challenge, attempts, problemIds: (row.problem_ids as string[]) ?? [] };
}

/** Pulls from the seeded `problems` table (source='sat') only — no AI
 *  generation, by design, so challenges keep working while the agents
 *  backend is out of credits. Returns fewer than `count` ids if the
 *  subtopic doesn't have enough seeded problems; the caller decides what
 *  to do with a short result. */
export async function lockProblemIds(subtopicId: string, count: number): Promise<string[]> {
  const { data } = await supabase
    .from("problems")
    .select("id")
    .eq("source", "sat")
    .eq("subtopic_id", subtopicId);

  const ids = (data ?? []).map((r) => r.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, count);
}

export async function createChallenge(input: {
  challengerId: string;
  opponentId: string;
  subtopicId: string;
  questionCount: number;
  scheduledAt: string;
  problemIds: string[];
}): Promise<string> {
  const { data, error } = await supabase
    .from("quiz_challenges")
    .insert({
      challenger_id: input.challengerId,
      opponent_id: input.opponentId,
      subtopic_id: input.subtopicId,
      question_count: input.questionCount,
      problem_ids: input.problemIds,
      scheduled_at: input.scheduledAt,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create challenge");
  return data.id;
}

export async function acceptChallenge(
  challengeId: string,
  challengerId: string,
  opponentId: string
) {
  const { error } = await supabase
    .from("quiz_challenges")
    .update({ status: "scheduled" })
    .eq("id", challengeId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);

  const { error: attemptsError } = await supabase.from("quiz_challenge_attempts").insert([
    { challenge_id: challengeId, user_id: challengerId },
    { challenge_id: challengeId, user_id: opponentId },
  ]);
  if (attemptsError) throw new Error(attemptsError.message);
}

export async function declineChallenge(challengeId: string) {
  const { error } = await supabase
    .from("quiz_challenges")
    .update({ status: "declined" })
    .eq("id", challengeId)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
}

export async function getProblemsByIds(problemIds: string[]) {
  const { data } = await supabase
    .from("problems")
    .select("id, question_text, options, time_recommendation_seconds")
    .in("id", problemIds);

  const byId = new Map((data ?? []).map((p) => [p.id, p]));
  return problemIds
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p);
}

export async function getMyAttempt(challengeId: string, userId: string) {
  const { data } = await supabase
    .from("quiz_challenge_attempts")
    .select("id, submitted_at")
    .eq("challenge_id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

/** Recomputes correctness server-side against the locked problems' real
 *  correct_option — a head-to-head competition can't trust the client's
 *  self-reported score the way the solo sat-quiz/submit route does. */
export async function submitChallengeAttempt(
  challengeId: string,
  userId: string,
  answers: { problemId: string; selectedOption: number }[],
  timeElapsedSeconds: number
): Promise<{ score: number }> {
  const { data: problemRows } = await supabase
    .from("problems")
    .select("id, correct_option")
    .in("id", answers.map((a) => a.problemId));

  const correctById = new Map((problemRows ?? []).map((p) => [p.id, p.correct_option]));
  let score = 0;
  for (const a of answers) {
    if (correctById.get(a.problemId) === a.selectedOption) score++;
  }

  const { error: updateError } = await supabase
    .from("quiz_challenge_attempts")
    .update({
      answers,
      score,
      time_elapsed_seconds: timeElapsedSeconds,
      submitted_at: new Date().toISOString(),
    })
    .eq("challenge_id", challengeId)
    .eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);

  const { data: attempts } = await supabase
    .from("quiz_challenge_attempts")
    .select("user_id, score, time_elapsed_seconds, submitted_at")
    .eq("challenge_id", challengeId);

  const rows = attempts ?? [];
  const allSubmitted = rows.length === 2 && rows.every((a) => a.submitted_at);
  if (allSubmitted) {
    const [a, b] = rows as {
      user_id: string;
      score: number;
      time_elapsed_seconds: number;
    }[];
    let winnerId: string | null = null;
    if (a.score !== b.score) {
      winnerId = a.score > b.score ? a.user_id : b.user_id;
    } else if (a.time_elapsed_seconds !== b.time_elapsed_seconds) {
      winnerId = a.time_elapsed_seconds < b.time_elapsed_seconds ? a.user_id : b.user_id;
    }
    await supabase
      .from("quiz_challenges")
      .update({ status: "completed", winner_id: winnerId })
      .eq("id", challengeId);
  }

  return { score };
}
