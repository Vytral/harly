import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import {
  applications,
  customRoles,
  db,
  jobHiringTeam,
  member,
  user,
  workflowDefinitions,
  workflowRuns,
} from "@harly/db";

import { RECRUITER_PERMISSIONS, createAuthorizationFixture, type AuthorizationFixture } from "@/test-support/authorization-fixture";
import { runPipelineIntegration } from "@/test-support/pipeline-fixture";

import { getActionHandler, type ActionContext } from "./registry";
import { createRun, runWorkflow } from "./engine";
import { createRegistryActionAdapter } from "./runtime/worker";

/**
 * Automations run as their creator. The creator's role may be limited to
 * assigned jobs, so a workflow must not move or re-status an application on a
 * job the creator cannot act on in the UI. Covers the registry handlers, the
 * v2 adapter, and the v1 engine, which all share the same handler code.
 */
describe.skipIf(!runPipelineIntegration)("automation actions respect the creator's job scope (database)", () => {
  let fx: AuthorizationFixture;
  const tag = randomUUID().slice(0, 8);
  const moverRoleKey = `mover-${tag}`;
  // Creator with candidates:move and candidates:edit, limited to assigned jobs.
  // Global permission checks pass, so only the job-scope check can stop a step.
  const moverUserId = `mover-user-${tag}`;
  let applicationOnJobB: string;
  let applicationOnJobA: string;

  async function currentStage(applicationId: string) {
    const [row] = await db
      .select({ stageId: applications.currentStageId, status: applications.status })
      .from(applications)
      .where(eq(applications.id, applicationId));
    return row!;
  }

  function ctxFor(actorUserId: string, applicationId: string, jobId: string): ActionContext {
    return {
      workspaceId: fx.workspaceId,
      database: db,
      actorUserId,
      triggerEvent: "application.created",
      triggerPayload: { application: { id: applicationId, jobId } },
      effectKey: `effect-${randomUUID()}`,
      runId: randomUUID(),
    } as unknown as ActionContext;
  }

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    await db.insert(customRoles).values({
      workspaceId: fx.workspaceId,
      key: moverRoleKey,
      name: "Mover",
      permissions: [...RECRUITER_PERMISSIONS, "candidates:move", "candidates:edit"],
      scope: { jobAccess: "assigned", departments: [], regions: [] },
    });
    const now = new Date();
    await db.insert(user).values({
      id: moverUserId,
      name: `Mover ${tag}`,
      email: `${moverUserId}@example.test`,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(member).values([
      { id: `m-mover-${tag}`, organizationId: fx.workspaceId, userId: moverUserId, role: moverRoleKey, createdAt: now, updatedAt: now },
      { id: `m-full-${tag}`, organizationId: fx.workspaceId, userId: fx.users.full, role: fx.roleKeys.full, createdAt: now, updatedAt: now },
    ]);
    // The mover is assigned to job A only.
    await db.insert(jobHiringTeam).values({
      workspaceId: fx.workspaceId,
      jobId: fx.jobA,
      userId: moverUserId,
      role: "recruiter",
    });
    // candidateB applies only to job B (not assigned to the mover).
    const [onB] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.candidateId, fx.candidateB));
    applicationOnJobB = onB!.id;
    // candidateA applies only to job A (assigned to the mover).
    const [onA] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.candidateId, fx.candidateA));
    applicationOnJobA = onA!.id;
  });

  afterAll(async () => {
    if (fx) {
      await db.delete(user).where(eq(user.id, moverUserId));
      await fx.cleanup();
    }
  });

  describe("registry handlers", () => {
    it("refuses move_stage on an application whose job the creator is not assigned to", async () => {
      const before = await currentStage(applicationOnJobB);
      const handler = getActionHandler("move_stage");
      const result = await handler!.run(
        { toStageId: fx.stagesB.interview!.id },
        ctxFor(moverUserId, applicationOnJobB, fx.jobB),
      );

      expect(result.success).toBe(false);
      expect(result.error ?? "").toMatch(/job scope|role/i);
      expect((await currentStage(applicationOnJobB)).stageId).toBe(before.stageId);
    });

    it("allows move_stage on an assigned job", async () => {
      const handler = getActionHandler("move_stage");
      const result = await handler!.run(
        { toStageId: fx.stagesA.interview!.id },
        ctxFor(moverUserId, applicationOnJobA, fx.jobA),
      );

      expect(result.success).toBe(true);
      expect((await currentStage(applicationOnJobA)).stageId).toBe(fx.stagesA.interview!.id);
    });

    it("refuses set_status on an out-of-scope application", async () => {
      const handler = getActionHandler("set_status");
      const result = await handler!.run(
        { status: "withdrawn" },
        ctxFor(moverUserId, applicationOnJobB, fx.jobB),
      );

      expect(result.success).toBe(false);
      expect((await currentStage(applicationOnJobB)).status).toBe("active");
    });

    it("keeps unrestricted creators unchanged", async () => {
      const handler = getActionHandler("move_stage");
      const result = await handler!.run(
        { toStageId: fx.stagesB.interview!.id },
        ctxFor(fx.users.full, applicationOnJobB, fx.jobB),
      );

      expect(result.success).toBe(true);
      expect((await currentStage(applicationOnJobB)).stageId).toBe(fx.stagesB.interview!.id);
    });
  });

  describe("v2 engine adapter", () => {
    it("fails the step with a non-succeeded outcome and leaves the stage unchanged", async () => {
      const before = await currentStage(applicationOnJobB);
      const adapter = createRegistryActionAdapter(db);
      const outcome = await adapter.execute({
        workspaceId: fx.workspaceId,
        runId: randomUUID(),
        workflowId: randomUUID(),
        actorUserId: moverUserId,
        triggerEvent: "application.created",
        triggerPayload: { application: { id: applicationOnJobB, jobId: fx.jobB } },
        node: { type: "action", actionType: "move_stage", toolVersion: 1 } as never,
        input: { toStageId: fx.stagesB.screening!.id },
        effectKey: `effect-${randomUUID()}`,
        signal: new AbortController().signal,
      });

      expect(outcome.status).toBe("failed");
      expect((await currentStage(applicationOnJobB)).stageId).toBe(before.stageId);
    });
  });

  describe("v1 engine", () => {
    it("fails the run when the move targets an out-of-scope job", async () => {
      const before = await currentStage(applicationOnJobB);
      const [definition] = await db
        .insert(workflowDefinitions)
        .values({
          workspaceId: fx.workspaceId,
          name: `Scope ${tag}`,
          enabled: true,
          status: "published",
          trigger: { event: "application.created" },
          triggerEvent: "application.created",
          conditions: [],
          actions: [{ type: "move_stage", config: { toStageId: fx.stagesB.offer!.id } }],
          createdById: moverUserId,
          engineVersion: 1,
        })
        .returning({ id: workflowDefinitions.id });

      const runId = await createRun({
        workspaceId: fx.workspaceId,
        workflowId: definition!.id,
        triggerEvent: "application.created",
        triggerPayload: { application: { id: applicationOnJobB, jobId: fx.jobB } },
      });
      const outcome = await runWorkflow(runId, { workerId: `test-${tag}` });

      expect(outcome.status).toBe("failed");
      const [run] = await db.select({ error: workflowRuns.error }).from(workflowRuns).where(eq(workflowRuns.id, runId));
      expect(run?.error ?? "").toMatch(/job scope|role/i);
      expect((await currentStage(applicationOnJobB)).stageId).toBe(before.stageId);
    });
  });
});
