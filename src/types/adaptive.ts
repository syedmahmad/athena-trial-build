export type SectionCategory = "ReadingWriting" | "Math";
export type QuestBucket = "weak" | "mid" | "stretch";
export type QuestStatus = "pending" | "in_progress" | "completed";

export type SubsectionSkill = {
  id: string;
  userId: string;
  subtopicId: string;
  sectionCategory: SectionCategory;
  level: number;
  xp: number;
  totalAttempts: number;
  correctAttempts: number;
  last10: boolean[];
  streakCorrect: number;
  streakWrong: number;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DailyQuest = {
  id: string;
  userId: string;
  questDate: string;
  status: QuestStatus;
  score: number;
  totalQuestions: number;
  correctCount: number;
  xpEarned: number;
  timeElapsedSeconds: number;
  createdAt: string;
  updatedAt: string;
};

export type DailyQuestProblem = {
  id: string;
  questId: string;
  problemId: string;
  subtopicId: string;
  orderIndex: number;
  bucket: QuestBucket;
  difficultyLevel: number;
  selectedOption: number | null;
  isCorrect: boolean | null;
  responseTimeMs: number | null;
  answeredAt: string | null;
};

export type DailyQuestProblemWithDetails = DailyQuestProblem & {
  questionText: string;
  options: string[];
  correctOption: number;
  explanation: string;
  solutionSteps: { step: number; instruction: string; math?: string }[];
  hint: string;
  detailedHint?: string;
  subtopicName: string;
  topicName: string;
};
