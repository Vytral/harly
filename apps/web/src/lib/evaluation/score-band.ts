/**
 * The one definition of fit-score bands. The AI scoring prompt, the evaluation
 * card, the ranking, the pipeline card, the talent pool and the Harly AI panel
 * all colour a score through this helper so the same number never reads green
 * in one place and blue in another.
 *
 *   80-100 strong, 60-79 good, 40-59 mixed, 0-39 weak.
 */
export type ScoreBand = "strong" | "good" | "mixed" | "weak";

export const SCORE_BAND_CUTOFFS = { strong: 80, good: 60, mixed: 40 } as const;

export function scoreBand(score: number): ScoreBand {
  if (score >= SCORE_BAND_CUTOFFS.strong) return "strong";
  if (score >= SCORE_BAND_CUTOFFS.good) return "good";
  if (score >= SCORE_BAND_CUTOFFS.mixed) return "mixed";
  return "weak";
}

export const SCORE_BAND_LABEL: Record<ScoreBand, string> = {
  strong: "Strong fit",
  good: "Good fit",
  mixed: "Mixed fit",
  weak: "Weak fit",
};
