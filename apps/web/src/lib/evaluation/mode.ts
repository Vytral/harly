export const EVALUATION_MODES = ["relaxed", "balanced", "strict"] as const;

export type EvaluationMode = (typeof EVALUATION_MODES)[number];

export const DEFAULT_EVALUATION_MODE: EvaluationMode = "balanced";
