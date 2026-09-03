const DIFFICULTY_WEIGHTS: Record<string, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

export function calculateSkillScore(
  attempts: { difficulty: string; isCorrect: boolean }[]
): number {
  if (attempts.length === 0) return 0;

  let correctWeighted = 0;
  let totalWeighted = 0;

  for (const attempt of attempts) {
    const weight = DIFFICULTY_WEIGHTS[attempt.difficulty] ?? 1;
    totalWeighted += weight;
    if (attempt.isCorrect) {
      correctWeighted += weight;
    }
  }

  return Math.round((correctWeighted / totalWeighted) * 100);
}
