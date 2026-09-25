/**
 * Calibration diff harness — Phase 7 (Audit doc §24 Phase 7).
 *
 * Scoring changes are FORBIDDEN without benchmark evidence (§15.4, §28.3):
 * every future scoring PR must attach a before/after report produced here.
 * This module is that artifact generator — it compares two evaluation runs
 * over the same fixture ids and reports score deltas, tier migrations, and
 * changed fixtures. It never scores anything itself.
 */

import type { RulesEvaluation } from "../rules";

export interface ComparisonEntry {
  id: string;
  evaluation: RulesEvaluation;
}

export interface ScoreDelta {
  id: string;
  before: number;
  after: number;
  delta: number;
}

export interface TierMigration {
  id: string;
  before: string;
  after: string;
}

export interface CalibrationDiff {
  compared: number;
  missingIds: string[];
  scoreDeltas: ScoreDelta[];
  tierMigrations: TierMigration[];
  maxAbsScoreDelta: number;
  changedIds: string[];
}

export function compareEvaluations(
  before: ComparisonEntry[],
  after: ComparisonEntry[],
): CalibrationDiff {
  const afterById = new Map(after.map((entry) => [entry.id, entry.evaluation]));
  const beforeIds = new Set(before.map((entry) => entry.id));
  const missingIds = after
    .map((entry) => entry.id)
    .filter((id) => !beforeIds.has(id))
    .concat(before.map((entry) => entry.id).filter((id) => !afterById.has(id)));

  const scoreDeltas: ScoreDelta[] = [];
  const tierMigrations: TierMigration[] = [];
  const changed = new Set<string>();

  for (const { id, evaluation } of before) {
    const other = afterById.get(id);
    if (!other) continue;
    if (other.result.score !== evaluation.result.score) {
      scoreDeltas.push({
        id,
        before: evaluation.result.score,
        after: other.result.score,
        delta: other.result.score - evaluation.result.score,
      });
      changed.add(id);
    }
    if (other.result.recommendation !== evaluation.result.recommendation) {
      tierMigrations.push({
        id,
        before: evaluation.result.recommendation,
        after: other.result.recommendation,
      });
      changed.add(id);
    }
  }

  return {
    compared: before.filter((entry) => afterById.has(entry.id)).length,
    missingIds: [...new Set(missingIds)],
    scoreDeltas,
    tierMigrations,
    maxAbsScoreDelta: scoreDeltas.reduce((max, entry) => Math.max(max, Math.abs(entry.delta)), 0),
    changedIds: [...changed],
  };
}
