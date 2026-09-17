export type ChallengeStatus = "pending" | "declined" | "scheduled" | "expired" | "completed";

export type Challenge = {
  id: string;
  challengerId: string;
  opponentId: string;
  subtopicId: string;
  questionCount: number;
  scheduledAt: string;
  status: ChallengeStatus;
  winnerId: string | null;
  createdAt: string;
  // Denormalized for display — joined in at the query layer.
  challengerName: string | null;
  opponentName: string | null;
  subtopicName: string | null;
  topicName: string | null;
};

export type ChallengeAttempt = {
  id: string;
  challengeId: string;
  userId: string;
  score: number | null;
  timeElapsedSeconds: number | null;
  submittedAt: string | null;
};

/** Grace window after scheduled_at within which an accepted-but-unstarted
 *  challenge can still be started before it's treated as expired. */
export const CHALLENGE_EXPIRY_GRACE_MS = 48 * 60 * 60 * 1000;

export type ChallengesListResponse = {
  incoming: Challenge[];
  outgoing: Challenge[];
  scheduled: Challenge[];
  completed: (Challenge & { attempts: ChallengeAttempt[] })[];
};

export type ChallengeDetailResponse = {
  challenge: Challenge;
  attempts: ChallengeAttempt[];
  // Present only once now >= scheduledAt.
  problems?: {
    id: string;
    questionText: string;
    options: string[];
    timeRecommendationSeconds: number;
  }[];
  startsAt?: string;
};
