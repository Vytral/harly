import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const integration =
  process.env.RUN_EVALUATION_PERSISTENCE_INTEGRATION === "1"
    ? describe
    : describe.skip;

import { aiEvaluationRevisions, aiEvaluations, applications, db } from "@harly/db";
import { desc, eq } from "drizzle-orm";
import { persistCandidateEvaluation } from "./service";
import type { EvaluationMetadata, RulesRubric } from "@/lib/evaluation/rules";

integration("evaluation persistence round trip", () => {
  afterAll(async () => {
    await db.$client.end();
  });

  it("keeps snapshots, assigns the persisted id, and appends revisions", async () => {
    const [application] = await db
      .select({
        id: applications.id,
        workspaceId: applications.workspaceId,
        candidateId: applications.candidateId,
        jobId: applications.jobId,
      })
      .from(applications)
      .orderBy(desc(applications.createdAt))
      .limit(1);

    expect(application).toBeDefined();

    const rubric: RulesRubric = {
      version: "integration-rubric-v1",
      criteria: [
        {
          key: "python",
          label: "Python",
          type: "skill",
          importance: "required",
          weight: 1,
          aliases: ["python"],
        },
      ],
    };
    const metadata: EvaluationMetadata = {
      engineVersion: "rules-v5",
      parserVersion: "parser-v2",
      matcherVersion: "matcher-v2",
      scoringVersion: "scoring-v2",
      taxonomyVersion: "taxonomy-v1",
      criterionResultSchemaVersion: 2,
      referenceDate: "2026-01-01T00:00:00.000Z",
      evaluatedAt: "2026-01-01T00:00:00.000Z",
      totalCriteriaCount: 1,
      scoredCriteriaCount: 1,
      neutralEvidenceBaseline: 40,
      resumeSourceHash: "resume-hash",
      candidateFactsHash: "facts-hash",
      rubricHash: "rubric-hash",
      configuration: {
        evaluationMode: "balanced",
        modeTableVersion: "mode-thresholds-v1",
        neutralEvidenceBaseline: 40,
        requiredWeightFactor: 1,
        preferredWeightFactor: 0.5,
        knockoutSoftness: "hard",
        semanticThresholds: { equivalent: 0.85, related: 0.7 },
        tierThresholds: {
          strongYesMinScore: 85,
          strongYesMinCoverage: 80,
          strongYesMinConfidence: 75,
          yesMinScore: 70,
          yesMinCoverage: 65,
          maybeMinScore: 45,
        },
      },
    };
    const result = {
      score: 77,
      recommendation: "yes" as const,
      summary: "Round-trip integration evaluation.",
      strengths: ["Python"],
      gaps: [],
      criteria: [{ label: "Python", score: 80, evidence: "Python" }],
    };
    const base = {
      workspaceId: application!.workspaceId,
      candidateId: application!.candidateId,
      applicationId: application!.id,
      jobId: application!.jobId,
      source: "rules" as const,
      provider: "harly",
      modelId: "rules-v5",
      engine: "harly-rules",
      engineVersion: "rules-v5",
      rubricVersion: rubric.version,
      rubricSnapshot: rubric,
      result,
      criterionResults: [],
      candidateFactsSnapshot: { schemaVersion: 2, rawText: "Python" },
      skillProfilesSnapshot: { schemaVersion: 1, profiles: [] },
      evaluationMetadataSnapshot: metadata,
      criterionDetailsSnapshot: [],
      impactHighlightsSnapshot: [],
      evidenceCoverage: 100,
      confidence: 90,
      requiresHumanReview: false,
      usedResume: true,
      generatedById: null,
      inputFingerprintSource: { resumeText: "Python", rubric },
    } satisfies Parameters<typeof persistCandidateEvaluation>[0];

    const first = await persistCandidateEvaluation(base);
    const revisionsAfterFirst = await db
      .select({
        revision: aiEvaluationRevisions.revision,
        snapshot: aiEvaluationRevisions.snapshot,
      })
      .from(aiEvaluationRevisions)
      .where(eq(aiEvaluationRevisions.evaluationId, first.id));
    const second = await persistCandidateEvaluation({
      ...base,
      result: { ...result, score: 78 },
    });
    const [current] = await db
      .select({
        id: aiEvaluations.id,
        score: aiEvaluations.score,
        metadata: aiEvaluations.evaluationMetadataSnapshot,
        facts: aiEvaluations.candidateFactsSnapshot,
      })
      .from(aiEvaluations)
      .where(eq(aiEvaluations.id, second.id));
    const revisions = await db
      .select({
        evaluationId: aiEvaluationRevisions.evaluationId,
        revision: aiEvaluationRevisions.revision,
        snapshot: aiEvaluationRevisions.snapshot,
      })
      .from(aiEvaluationRevisions)
      .where(eq(aiEvaluationRevisions.evaluationId, second.id));

    expect(first.id).toBe(second.id);
    expect(current?.score).toBe(78);
    expect((current?.metadata as EvaluationMetadata).evaluationId).toBe(second.id);
    expect(current?.facts).toEqual(base.candidateFactsSnapshot);
    expect(revisions).toHaveLength(revisionsAfterFirst.length + 1);
    expect(revisions.at(-1)?.revision).toBe((revisionsAfterFirst.at(-1)?.revision ?? 0) + 1);
    expect((revisions.at(-1)?.snapshot as { score?: number }).score).toBe(77);
  });
});
