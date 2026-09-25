import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, desc, eq } from "drizzle-orm";

import {
  applications,
  candidates,
  createDatabaseClient,
  domainEventOutbox,
  jobStages,
  jobs,
  organization,
  user as authUser,
  workflowDefinitions,
} from "@harly/db";

import { evaluateApplicationForWorkflow } from "./auto-score";

const url = process.env.AUTOMATIONS_TEST_DATABASE_URL;
if (
  url &&
  (!new URL(url).pathname.startsWith("/harly_automations_verify_") ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
) {
  throw new Error("Use an isolated local automations verification database");
}

/**
 * evaluation.completed (telemetry/taxonomy follow-up): verifies that scoring
 * an application through the workflow path emits a durable domain event
 * carrying the evaluation result, and that a workflow-caused evaluation
 * propagates its causing run as `automationParentRunId` so the existing
 * lineage-depth anti-loop guard in dispatchWorkflowEvent can bound a workflow
 * that re-triggers ai_score on its own evaluation output.
 */
describe.skipIf(!url)(
  "evaluateApplicationForWorkflow emits evaluation.completed",
  () => {
    const client = url ? createDatabaseClient(url) : null;
    const workspaceId = `eval-event-it-${randomUUID()}`;
    const userId = `eval-event-user-${randomUUID()}`;
    const jobId = randomUUID();
    const stageId = randomUUID();
    const candidateId = randomUUID();
    const applicationId = randomUUID();
    const workflowId = randomUUID();
    const causingRunId = randomUUID();

    beforeAll(async () => {
      await client!.db.insert(organization).values({
        id: workspaceId,
        name: "Evaluation event test",
        slug: workspaceId,
        createdAt: new Date(),
      });
      await client!.db.insert(authUser).values({
        id: userId,
        name: "Evaluation event actor",
        email: `${userId}@example.test`,
      });
      await client!.db.insert(jobs).values({
        id: jobId,
        workspaceId,
        title: "Evaluation event test job",
        slug: `eval-event-${jobId}`,
        employmentType: "full_time",
        workplaceType: "remote",
        description: "Test job for evaluation.completed emission",
        createdById: userId,
      });
      await client!.db.insert(jobStages).values({
        id: stageId,
        workspaceId,
        jobId,
        name: "Applied",
        order: 0,
      });
      await client!.db.insert(candidates).values({
        id: candidateId,
        workspaceId,
        firstName: "Eval",
        lastName: "Event",
        email: `${candidateId}@example.test`,
      });
      await client!.db.insert(applications).values({
        id: applicationId,
        workspaceId,
        candidateId,
        jobId,
        currentStageId: stageId,
      });
      // A minimal disabled workflow so the FK on workflow_runs (used indirectly
      // by lineage lookups) has something to reference if ever needed; not
      // actually triggered by this test.
      await client!.db.insert(workflowDefinitions).values({
        id: workflowId,
        workspaceId,
        name: "Evaluation event test workflow",
        triggerEvent: "application.created",
        trigger: { event: "application.created" },
        conditions: [],
        actions: [],
        enabled: false,
        status: "draft",
      });
    });

    afterAll(async () => {
      await client!.db
        .delete(organization)
        .where(eq(organization.id, workspaceId));
      await client!.db.delete(authUser).where(eq(authUser.id, userId));
      await client!.sql.end();
    });

    it("persists an evaluation.completed domain event with the evaluation result", async () => {
      const result = await evaluateApplicationForWorkflow({
        workspaceId,
        applicationId,
        actorUserId: userId,
      });

      expect(result.success, result.error).toBe(true);
      expect(result.evaluationId).toBeTruthy();

      const [event] = await client!.db
        .select({
          eventName: domainEventOutbox.eventName,
          payload: domainEventOutbox.payload,
          automationParentRunId: domainEventOutbox.automationParentRunId,
        })
        .from(domainEventOutbox)
        .where(
          and(
            eq(domainEventOutbox.workspaceId, workspaceId),
            eq(domainEventOutbox.eventName, "evaluation.completed"),
          ),
        );

      expect(event).toBeDefined();
      expect(event?.payload).toMatchObject({
        application: { id: applicationId, jobId },
        candidate: { id: candidateId },
        evaluation: {
          id: result.evaluationId,
          score: result.score,
          recommendation: result.recommendation,
        },
      });
      // Called without a causing run: no parentRunId to propagate.
      expect(event?.automationParentRunId).toBeNull();
    });

    it("propagates the causing workflow run as automationParentRunId when invoked from a workflow", async () => {
      const secondApplicationId = randomUUID();
      const secondCandidateId = randomUUID();
      await client!.db.insert(candidates).values({
        id: secondCandidateId,
        workspaceId,
        firstName: "Eval",
        lastName: "FromRun",
        email: `${secondCandidateId}@example.test`,
      });
      await client!.db.insert(applications).values({
        id: secondApplicationId,
        workspaceId,
        candidateId: secondCandidateId,
        jobId,
        currentStageId: stageId,
      });

      const result = await evaluateApplicationForWorkflow({
        workspaceId,
        applicationId: secondApplicationId,
        actorUserId: userId,
        runId: causingRunId,
      });
      expect(result.success, result.error).toBe(true);

      const [event] = await client!.db
        .select({
          automationParentRunId: domainEventOutbox.automationParentRunId,
        })
        .from(domainEventOutbox)
        .where(
          and(
            eq(domainEventOutbox.workspaceId, workspaceId),
            eq(domainEventOutbox.eventName, "evaluation.completed"),
          ),
        )
        .orderBy(desc(domainEventOutbox.id))
        .limit(1);

      expect(event?.automationParentRunId).toBe(causingRunId);
    });
  },
);
