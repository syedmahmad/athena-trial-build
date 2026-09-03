import type { SubsectionSkill, QuestBucket } from "@/types/adaptive";

// --- Accuracy ---

export function computeLast10Accuracy(last10: boolean[]): number {
  if (last10.length === 0) return 0;
  const correct = last10.filter(Boolean).length;
  return (correct / last10.length) * 100;
}

// --- Adaptive Level ---

export function computeAdaptiveLevel(skill: SubsectionSkill): number {
  const accuracy = computeLast10Accuracy(skill.last10);
  let newLevel = skill.level;

  // Level up: last10 accuracy >= 80% OR streak of 3+ correct
  if (accuracy >= 80 || skill.streakCorrect >= 3) {
    newLevel = skill.level + 1;
  }
  // Level down (temporary): streak of 2+ wrong OR last10 accuracy <= 50%
  else if (skill.streakWrong >= 2 || (skill.last10.length >= 5 && accuracy <= 50)) {
    newLevel = skill.level - 1;
  }

  // Permanent demotion: last10 accuracy <= 40% on a full 10-answer window
  if (skill.last10.length >= 10 && accuracy <= 40) {
    newLevel = skill.level - 2;
  }

  return clamp(newLevel, 1, 10);
}

// --- Global Difficulty Floor ---

export function computeGlobalFloor(composite: number): number {
  if (composite >= 1300) return 7;
  if (composite >= 1100) return 5;
  if (composite >= 900) return 3;
  return 1;
}

// --- Served Difficulty ---

export function computeServedDifficulty(
  subsectionLevel: number,
  globalFloor: number
): number {
  return Math.max(subsectionLevel, globalFloor);
}

// --- XP ---

export function computeXpForDifficulty(difficultyLevel: number): number {
  if (difficultyLevel >= 9) return 40;
  if (difficultyLevel >= 7) return 20;
  if (difficultyLevel >= 4) return 10;
  return 5;
}

// --- Skill Update After Answer ---

export type SkillMutations = {
  level: number;
  xp: number;
  totalAttempts: number;
  correctAttempts: number;
  last10: boolean[];
  streakCorrect: number;
  streakWrong: number;
  lastSeenAt: string;
};

export function updateSkillAfterAnswer(
  skill: SubsectionSkill,
  isCorrect: boolean,
  difficultyLevel: number
): SkillMutations {
  // Update last10: push new result, keep max 10
  const newLast10 = [...skill.last10, isCorrect].slice(-10);

  // Update streaks
  const streakCorrect = isCorrect ? skill.streakCorrect + 1 : 0;
  const streakWrong = isCorrect ? 0 : skill.streakWrong + 1;

  // Update attempts
  const totalAttempts = skill.totalAttempts + 1;
  const correctAttempts = skill.correctAttempts + (isCorrect ? 1 : 0);

  // Compute new level using updated state
  const updatedSkill: SubsectionSkill = {
    ...skill,
    last10: newLast10,
    streakCorrect,
    streakWrong,
    totalAttempts,
    correctAttempts,
  };
  const newLevel = computeAdaptiveLevel(updatedSkill);

  // Compute XP earned
  const xpEarned = isCorrect ? computeXpForDifficulty(difficultyLevel) : 0;

  return {
    level: newLevel,
    xp: skill.xp + xpEarned,
    totalAttempts,
    correctAttempts,
    last10: newLast10,
    streakCorrect,
    streakWrong,
    lastSeenAt: new Date().toISOString(),
  };
}

// --- Quest Composition ---

export type BucketAssignment = {
  subtopicId: string;
  bucket: QuestBucket;
  targetDifficulty: number;
};

export function composeDailyQuestBuckets(
  skills: SubsectionSkill[],
  globalFloor: number
): BucketAssignment[] {
  if (skills.length === 0) return [];

  // Sort by level ascending (weakest first)
  const sorted = [...skills].sort((a, b) => a.level - b.level);

  const total = sorted.length;
  const weakCount = Math.max(1, Math.round(total * 0.6));
  const midCount = Math.max(1, Math.round(total * 0.3));
  // stretch gets the rest

  return sorted.map((skill, i): BucketAssignment => {
    let bucket: QuestBucket;
    let targetDifficulty: number;

    if (i < weakCount) {
      bucket = "weak";
      targetDifficulty = computeServedDifficulty(skill.level, globalFloor);
    } else if (i < weakCount + midCount) {
      bucket = "mid";
      targetDifficulty = computeServedDifficulty(skill.level, globalFloor);
    } else {
      bucket = "stretch";
      targetDifficulty = computeServedDifficulty(
        clamp(skill.level + 1, 1, 10),
        globalFloor
      );
    }

    return { subtopicId: skill.subtopicId, bucket, targetDifficulty };
  });
}

/**
 * Given bucket assignments and a target of 20 questions,
 * returns how many questions to pull from each subtopic.
 */
export function distributeQuestQuestions(
  buckets: BucketAssignment[],
  totalQuestions: number = 20
): (BucketAssignment & { questionCount: number })[] {
  const weakBuckets = buckets.filter((b) => b.bucket === "weak");
  const midBuckets = buckets.filter((b) => b.bucket === "mid");
  const stretchBuckets = buckets.filter((b) => b.bucket === "stretch");

  const weakTotal = Math.round(totalQuestions * 0.6); // 12
  const midTotal = Math.round(totalQuestions * 0.3); // 6
  const stretchTotal = totalQuestions - weakTotal - midTotal; // 2

  const distribute = (
    items: BucketAssignment[],
    count: number
  ): (BucketAssignment & { questionCount: number })[] => {
    if (items.length === 0) return [];
    const base = Math.floor(count / items.length);
    let remainder = count - base * items.length;
    return items.map((item) => {
      const extra = remainder > 0 ? 1 : 0;
      remainder--;
      return { ...item, questionCount: base + extra };
    });
  };

  return [
    ...distribute(weakBuckets, weakTotal),
    ...distribute(midBuckets, midTotal),
    ...distribute(stretchBuckets, stretchTotal),
  ];
}

// --- Helpers ---

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
