/**
 * SAT scoring: raw-to-scaled conversion.
 *
 * The real SAT uses equating tables that vary per test form.
 * We approximate with a piecewise linear mapping that closely matches
 * published College Board score conversion charts.
 */

/**
 * Scale a Reading & Writing raw score (0-54) to 200-800.
 */
export function scaleRwScore(rawCorrect: number, totalQuestions = 54): number {
  const ratio = Math.max(0, Math.min(1, rawCorrect / totalQuestions));

  // Piecewise linear approximation matching typical SAT R&W curves
  if (ratio >= 0.96) return 800;
  if (ratio >= 0.89) return 750 + Math.round(((ratio - 0.89) / 0.07) * 50);
  if (ratio >= 0.78) return 650 + Math.round(((ratio - 0.78) / 0.11) * 100);
  if (ratio >= 0.63) return 530 + Math.round(((ratio - 0.63) / 0.15) * 120);
  if (ratio >= 0.44) return 400 + Math.round(((ratio - 0.44) / 0.19) * 130);
  if (ratio >= 0.26) return 300 + Math.round(((ratio - 0.26) / 0.18) * 100);
  if (ratio >= 0.11) return 230 + Math.round(((ratio - 0.11) / 0.15) * 70);
  return 200 + Math.round((ratio / 0.11) * 30);
}

/**
 * Scale a Math raw score (0-44) to 200-800.
 */
export function scaleMathScore(rawCorrect: number, totalQuestions = 44): number {
  const ratio = Math.max(0, Math.min(1, rawCorrect / totalQuestions));

  // Piecewise linear approximation matching typical SAT Math curves
  if (ratio >= 0.98) return 800;
  if (ratio >= 0.91) return 750 + Math.round(((ratio - 0.91) / 0.07) * 50);
  if (ratio >= 0.80) return 650 + Math.round(((ratio - 0.80) / 0.11) * 100);
  if (ratio >= 0.64) return 530 + Math.round(((ratio - 0.64) / 0.16) * 120);
  if (ratio >= 0.45) return 400 + Math.round(((ratio - 0.45) / 0.19) * 130);
  if (ratio >= 0.27) return 300 + Math.round(((ratio - 0.27) / 0.18) * 100);
  if (ratio >= 0.11) return 230 + Math.round(((ratio - 0.11) / 0.16) * 70);
  return 200 + Math.round((ratio / 0.11) * 30);
}

/**
 * Compute the full SAT composite score from raw correct counts.
 */
export function computeFullSatScore(rwRaw: number, mathRaw: number) {
  const rwScaled = scaleRwScore(rwRaw);
  const mathScaled = scaleMathScore(mathRaw);
  return {
    rwScaled,
    mathScaled,
    total: rwScaled + mathScaled,
  };
}
