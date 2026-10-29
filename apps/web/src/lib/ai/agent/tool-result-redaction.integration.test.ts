import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { candidates, db, interviews } from "@harly/db";

import { createPipelineFixture, runPipelineIntegration } from "@/test-support/pipeline-fixture";

import { loadCandidateReferences } from "./tool-result-redaction";

describe.skipIf(!runPipelineIntegration)("loadCandidateReferences (database)", () => {
  it("resolves candidates by id, application, interview and email inside one workspace only", async () => {
    const workspace = await createPipelineFixture();
    const other = await createPipelineFixture();
    try {
      const stageId = Object.values(workspace.stages)[0]!.id;
      const { applicationId, candidateId } = await workspace.addApplication({ stageId });
      const otherStageId = Object.values(other.stages)[0]!.id;
      const outside = await other.addApplication({ stageId: otherStageId });

      const [row] = await db
        .select({ email: candidates.email, firstName: candidates.firstName, lastName: candidates.lastName })
        .from(candidates)
        .where(eq(candidates.id, candidateId));
      const email = row!.email!;

      const interviewId = randomUUID();
      await db.insert(interviews).values({
        id: interviewId,
        workspaceId: workspace.workspaceId,
        applicationId,
        jobId: workspace.jobId,
        candidateId,
        scheduledAt: new Date("2026-11-02T10:30:00.000Z"),
      });

      const lookup = await loadCandidateReferences(workspace.workspaceId, {
        candidateIds: [outside.candidateId],
        applicationIds: [applicationId, outside.applicationId],
        interviewIds: [interviewId],
        emails: [email.toUpperCase(), "nobody@example.test"],
      });

      const ids = lookup.candidates.map((record) => record.id);
      expect(ids).toContain(candidateId);
      expect(ids).not.toContain(outside.candidateId);
      expect(lookup.candidates.find((record) => record.id === candidateId)).toMatchObject({
        firstName: row!.firstName,
        lastName: row!.lastName,
        email,
      });
      expect(lookup.candidateIdByApplicationId.get(applicationId)).toBe(candidateId);
      expect(lookup.candidateIdByApplicationId.has(outside.applicationId)).toBe(false);
      expect(lookup.candidateIdByInterviewId.get(interviewId)).toBe(candidateId);
      expect(lookup.candidateIdByEmail.get(email.toLowerCase())).toBe(candidateId);
      expect(lookup.candidateIdByEmail.has("nobody@example.test")).toBe(false);
    } finally {
      await other.cleanup();
      await workspace.cleanup();
    }
  });

  it("returns nothing for an empty request without touching the database", async () => {
    const lookup = await loadCandidateReferences("no-such-workspace", {
      candidateIds: [],
      applicationIds: [],
      interviewIds: [],
      emails: [],
    });
    expect(lookup.candidates).toEqual([]);
    expect(lookup.candidateIdByApplicationId.size).toBe(0);
  });
});
