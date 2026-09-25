import { describe, expect, it } from "vitest";

import { evaluateCandidateWithRules } from "../rules";
import { BENCHMARK_CORPUS, BENCHMARK_REFERENCE_DATE } from "./corpus";
import { compareEvaluations } from "./compare";

function evaluateFixtureId(fixtureId: string, keywords?: string[]) {
  const fixture = BENCHMARK_CORPUS.find((f) => f.id === fixtureId)!;
  const evaluation = evaluateCandidateWithRules({
    job: { ...fixture.job, ...(keywords ? { keywords } : {}) },
    candidate: { resumeText: fixture.resumeText, answers: fixture.answers ?? [] },
    referenceDate: BENCHMARK_REFERENCE_DATE,
    evaluatedAt: `${BENCHMARK_REFERENCE_DATE}T12:00:00.000Z`,
  });
  return { id: fixtureId, evaluation };
}

describe("Phase 7 — calibration diff harness (§24)", () => {
  it("reports zero diff for identical runs (replay stability)", () => {
    const ids = ["backend-senior-python", "growth-marketing-manager"];
    const before = ids.map((id) => evaluateFixtureId(id));
    const after = ids.map((id) => evaluateFixtureId(id));
    const diff = compareEvaluations(before, after);
    expect(diff.compared).toBe(2);
    expect(diff.missingIds).toEqual([]);
    expect(diff.scoreDeltas).toEqual([]);
    expect(diff.tierMigrations).toEqual([]);
    expect(diff.maxAbsScoreDelta).toBe(0);
    expect(diff.changedIds).toEqual([]);
  });

  it("detects score deltas and tier migrations from a rubric change", () => {
    const before = [evaluateFixtureId("backend-senior-python")];
    // Adding an unevidenced required-depth skill moves coverage and score.
    const after = [evaluateFixtureId("backend-senior-python", ["Python", "PostgreSQL", "Kubernetes", "Rust"])];
    const diff = compareEvaluations(before, after);
    expect(diff.compared).toBe(1);
    expect(diff.changedIds).toContain("backend-senior-python");
    expect(diff.scoreDeltas.length).toBe(1);
    expect(diff.scoreDeltas[0]!.delta).toBe(
      diff.scoreDeltas[0]!.after - diff.scoreDeltas[0]!.before,
    );
  });

  it("reports unpaired fixture ids instead of dropping them silently", () => {
    const before = [evaluateFixtureId("backend-senior-python")];
    const after = [evaluateFixtureId("growth-marketing-manager")];
    const diff = compareEvaluations(before, after);
    expect(diff.compared).toBe(0);
    expect(diff.missingIds.sort()).toEqual(
      ["backend-senior-python", "growth-marketing-manager"].sort(),
    );
  });
});
