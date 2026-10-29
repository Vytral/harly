import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  aiConversationCandidates,
  aiConversations,
  aiEvaluations,
  db,
  deleteDemoSandbox,
  evaluationCriteria,
  evaluationCriterionResults,
  evaluationRubrics,
  sql,
} from "@harly/db";

import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

/** Count rows with a raw query, so the check does not depend on the ORM mapping. */
async function count(table: string, column: string, value: string): Promise<number> {
  const rows = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM ${sql(table)} WHERE ${sql(column)} = ${value}
  `;
  return rows[0].n;
}

describe.skipIf(!runPipelineIntegration)("sandbox wipe leaves no orphans (database)", () => {
  let fixture: PipelineFixture;

  beforeEach(async () => {
    fixture = await createPipelineFixture();
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  it("removes AI links, rubric criteria and criterion results with their workspace", async () => {
    const { candidateId, applicationId } = await fixture.addApplication({
      stageId: fixture.stages.applied!.id,
    });
    const [conversation] = await db
      .insert(aiConversations)
      .values({ workspaceId: fixture.workspaceId, userId: fixture.userId })
      .returning({ id: aiConversations.id });
    await db.insert(aiConversationCandidates).values({
      conversationId: conversation.id,
      candidateId,
    });
    const [rubric] = await db
      .insert(evaluationRubrics)
      .values({
        workspaceId: fixture.workspaceId,
        jobId: fixture.jobId,
        version: 1,
        configHash: "orphan-check",
      })
      .returning({ id: evaluationRubrics.id });
    await db.insert(evaluationCriteria).values({
      rubricId: rubric.id,
      key: "orphan",
      label: "Orphan",
      type: "text",
      weight: 1,
    });
    const [evaluation] = await db
      .insert(aiEvaluations)
      .values({
        workspaceId: fixture.workspaceId,
        candidateId,
        applicationId,
        jobId: fixture.jobId,
        provider: "test",
        modelId: "test",
        score: 1,
        recommendation: "maybe",
        summary: "Synthetic",
      })
      .returning({ id: aiEvaluations.id });
    await db.insert(evaluationCriterionResults).values({
      evaluationId: evaluation.id,
      criterionKey: "orphan",
      label: "Orphan",
      status: "met",
    });

    await deleteDemoSandbox({
      sql,
      workspaceId: fixture.workspaceId,
      ownerUserId: null,
      uploadsRoot: join(tmpdir(), "harly-sandbox-wipe-no-uploads"),
    });

    expect(await count("organization", "id", fixture.workspaceId)).toBe(0);
    expect(await count("ai_conversation_candidates", "candidate_id", candidateId)).toBe(0);
    expect(await count("evaluation_criteria", "rubric_id", rubric.id)).toBe(0);
    expect(await count("evaluation_criterion_results", "evaluation_id", evaluation.id)).toBe(0);
  });

  it("handles every table that cascades from a workspace table without a workspace id", async () => {
    // A new table of this shape must be added to deleteWorkspaceOrphanRows, or
    // a replica-mode wipe leaves its rows behind.
    const rows = await sql<{ child_table: string }[]>`
      SELECT DISTINCT child.relname AS child_table
      FROM pg_constraint fk
      JOIN pg_class child ON child.oid = fk.conrelid
      JOIN pg_class parent ON parent.oid = fk.confrelid
      WHERE fk.contype = 'f'
        AND fk.confdeltype = 'c'
        AND EXISTS (
          SELECT 1 FROM pg_attribute pa
          WHERE pa.attrelid = parent.oid AND pa.attname = 'workspace_id' AND NOT pa.attisdropped
        )
        AND NOT EXISTS (
          SELECT 1 FROM pg_attribute ca
          WHERE ca.attrelid = child.oid AND ca.attname = 'workspace_id' AND NOT ca.attisdropped
        )
      ORDER BY 1
    `;
    expect(rows.map((row) => row.child_table)).toEqual([
      "ai_conversation_candidates",
      "evaluation_criteria",
      "evaluation_criterion_results",
    ]);
  });
});
