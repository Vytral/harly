import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, desc, eq, inArray, sql as expression } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import {
  activityEvents,
  aiEvaluations,
  applications,
  candidates,
  candidateNotes,
  createDatabaseClient,
  domainEventOutbox,
  documentRequestPackages,
  documentRequests,
  documents,
  jobStages,
  jobs,
  member as authMember,
  organization,
  signatureEnvelopes,
  signatureEvents,
  signatureRecipients,
  user as authUser,
  workflowApprovalVotes,
  workflowDefinitions,
  workflowDefinitionVersions,
  workflowExternalActionBuckets,
  workflowExternalActionRefunds,
  workflowNodeAttempts,
  workflowNodeExecutions,
  workflowRuns,
  workspaceAutomationPolicies,
  workspaceAutomationRunBuckets,
  workspaceAutomationExternalActionBuckets,
} from "@harly/db";
import { graphRunLeases } from "./leases";
import { graphNodeStore } from "./node-store";
import { graphRunStore } from "./run-store";
import type { NodeOutcome } from "./advance";
import { semanticGraphHash } from "../definition/hash";
import type { WorkflowGraphV2 } from "../definition/schema-v2";
import { createRegistryActionAdapter } from "./worker";
import {
  reassignWorkflowApproval,
  resolveWorkflowApproval,
  resolveWorkflowUncertain,
  reconcileMissedWorkflowEventWaits,
  resumeWorkflowDocumentWaits,
  resumeWorkflowEventWaits,
  runWorkflowV2,
  type ActionAdapter,
} from "./worker";
import { findDueWorkflowRuns } from "./due-runs";
import {
  cleanupExpiredWorkspaceAutomationBuckets,
  releaseUnstartedExternalActionReservation,
  recordExternalActionOutcome,
  reserveExternalActionPolicy,
  reserveRunAdmissionPolicy,
  withWorkspaceAutomationEffectPermit,
  workspaceAutomationsEnabled,
} from "./operational-policy";
import { expireOverdueDocuments } from "@/features/documents/expiry";
import {
  createDocumentRequestsForWorkflow,
  expireOverdueDocumentRequestPackages,
  reconcileDocumentRequestPackage,
} from "@/features/documents/requests-service";
import { storage } from "@/lib/storage";
import { pruneDomainEventOutbox } from "@/server/events/outbox";

const url = process.env.AUTOMATIONS_TEST_DATABASE_URL;
// Never run fixture writes against the user's ordinary database.
if (
  url &&
  (!new URL(url).pathname.startsWith("/harly_automations_verify_") ||
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
)
  throw new Error("Use an isolated local automations verification database");

describe.skipIf(!url)("Postgres graph leases", () => {
  const client = url ? createDatabaseClient(url) : null;
  const workspaceId = `lease-test-${randomUUID()}`;
  const otherWorkspaceId = `lease-other-${randomUUID()}`;
  const workflowId = randomUUID();
  const versionId = randomUUID();
  const fixtureUserId = `lease-user-${randomUUID()}`;
  const fixtureSecondUserId = `lease-user-${randomUUID()}`;
  const fixtureJobId = randomUUID();
  const fixtureStageId = randomUUID();
  const fixtureCandidateId = randomUUID();
  const fixtureApplicationId = randomUUID();
  let fixtureCreated = false;
  let uploadDir: string | null = null;
  const previousUploadsDir = process.env.UPLOADS_DIR;
  const previousHarlyUrl = process.env.HARLY_URL;
  const graph: WorkflowGraphV2 = {
    schemaVersion: 2,
    entryNodeId: "trigger",
    nodes: [
      { id: "trigger", type: "trigger", event: "application.created" },
      {
        id: "action",
        type: "action",
        actionType: "add_note",
        toolVersion: 1,
        failurePolicy: "continue",
        input: { body: { kind: "literal", value: "Hello" } },
      },
      { id: "end", type: "end", result: "completed" },
    ],
    edges: [
      { id: "e1", source: "trigger", port: "next", target: "action" },
      { id: "e2", source: "action", port: "success", target: "end" },
    ],
  };
  beforeAll(async () => {
    uploadDir = await mkdtemp(path.join(os.tmpdir(), "harly-automations-"));
    process.env.UPLOADS_DIR = uploadDir;
    // Registry actions may resolve portal links through the production config.
    // Keep this isolated test runnable with only the guarded DB URL supplied.
    process.env.HARLY_URL ??= "http://localhost:3000";
    const db = client!.db;
    await db.insert(organization).values({
      id: workspaceId,
      name: "Lease test",
      slug: workspaceId,
      createdAt: new Date(),
    });
    await db.insert(organization).values({
      id: otherWorkspaceId,
      name: "Other lease test",
      slug: otherWorkspaceId,
      createdAt: new Date(),
    });
    fixtureCreated = true;
    await db.insert(authUser).values({
      id: fixtureUserId,
      name: "Lease User",
      email: `${fixtureUserId}@example.test`,
    });
    await db.insert(authMember).values({
      id: `lease-member-${randomUUID()}`,
      organizationId: workspaceId,
      userId: fixtureUserId,
      role: "recruiter",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(authUser).values({
      id: fixtureSecondUserId,
      name: "Second Lease User",
      email: `${fixtureSecondUserId}@example.test`,
    });
    await db.insert(authMember).values({
      id: `lease-member-${randomUUID()}`,
      organizationId: workspaceId,
      userId: fixtureSecondUserId,
      role: "recruiter",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(jobs).values({
      id: fixtureJobId,
      workspaceId,
      title: "Package test job",
      slug: `package-${fixtureJobId}`,
      employmentType: "full_time",
      workplaceType: "remote",
      description: "Package test",
      createdById: fixtureUserId,
    });
    await db.insert(jobStages).values({
      id: fixtureStageId,
      workspaceId,
      jobId: fixtureJobId,
      name: "Applied",
      order: 0,
    });
    await db.insert(candidates).values({
      id: fixtureCandidateId,
      workspaceId,
      firstName: "Package",
      lastName: "Candidate",
      email: `${fixtureCandidateId}@example.test`,
    });
    await db.insert(applications).values({
      id: fixtureApplicationId,
      workspaceId,
      candidateId: fixtureCandidateId,
      jobId: fixtureJobId,
      currentStageId: fixtureStageId,
    });
    await db.insert(workflowDefinitions).values({
      id: workflowId,
      workspaceId,
      name: "Lease test",
      triggerEvent: "application.created",
      trigger: { event: "application.created" },
      conditions: [],
      actions: [],
      enabled: false,
      status: "draft",
    });
    await db.insert(workflowDefinitionVersions).values({
      id: versionId,
      workflowId,
      workspaceId,
      name: "Lease test",
      version: 1,
      schemaVersion: 2,
      graph,
      contentHash: semanticGraphHash(graph),
      publishedAt: new Date(),
      createdById: fixtureUserId,
      triggerEvent: "application.created",
      trigger: {},
      conditions: [],
      actions: [],
    });
  });
  afterAll(async () => {
    if (!client) return;
    try {
      if (fixtureCreated) {
        await client.db
          .delete(organization)
          .where(inArray(organization.id, [workspaceId, otherWorkspaceId]));
        await client.db.delete(authUser).where(eq(authUser.id, fixtureUserId));
        await client.db
          .delete(authUser)
          .where(eq(authUser.id, fixtureSecondUserId));
      }
    } finally {
      if (previousUploadsDir === undefined) delete process.env.UPLOADS_DIR;
      else process.env.UPLOADS_DIR = previousUploadsDir;
      if (previousHarlyUrl === undefined) delete process.env.HARLY_URL;
      else process.env.HARLY_URL = previousHarlyUrl;
      if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
      await client.sql.end();
    }
  });
  async function run(engineVersion = 2) {
    const id = randomUUID();
    await client!.db.insert(workflowRuns).values({
      id,
      workspaceId,
      workflowId,
      triggerEvent: "application.created",
      engineVersion,
      versionId,
      logicalStatus: "queued",
      cursorNodeId: "action",
      contextSnapshot: {},
    });
    return id;
  }
  async function runGraph(
    customGraph: WorkflowGraphV2,
    triggerPayload: Record<string, unknown> = {},
  ) {
    const customWorkflowId = randomUUID();
    const customVersionId = randomUUID();
    await client!.db.insert(workflowDefinitions).values({
      id: customWorkflowId,
      workspaceId,
      name: "Custom wait test",
      triggerEvent: customGraph.nodes.find((node) => node.type === "trigger")!
        .event,
      trigger: { event: "application.created" },
      conditions: [],
      actions: [],
    });
    await client!.db.insert(workflowDefinitionVersions).values({
      id: customVersionId,
      workflowId: customWorkflowId,
      workspaceId,
      name: "Custom wait test",
      version: 1,
      schemaVersion: 2,
      graph: customGraph,
      contentHash: semanticGraphHash(customGraph),
      publishedAt: new Date(),
      createdById: fixtureUserId,
      triggerEvent: "application.created",
      trigger: {},
      conditions: [],
      actions: [],
    });
    const runId = randomUUID();
    await client!.db.insert(workflowRuns).values({
      id: runId,
      workspaceId,
      workflowId: customWorkflowId,
      triggerEvent: "application.created",
      engineVersion: 2,
      versionId: customVersionId,
      logicalStatus: "queued",
      cursorNodeId: customGraph.entryNodeId,
      triggerPayload,
      contextSnapshot: triggerPayload,
    });
    return runId;
  }

  it("atomically reserves external capacity and opens the v2 circuit", async () => {
    await client!.db
      .insert(workspaceAutomationPolicies)
      .values({ workspaceId, maxExternalActionsPerMinute: 2 })
      .onConflictDoUpdate({
        target: workspaceAutomationPolicies.workspaceId,
        set: { enabled: true, maxExternalActionsPerMinute: 2 },
      });
    const policyWorkflowId = randomUUID();
    const rootRunId = randomUUID();
    await client!.db.insert(workflowDefinitions).values({
      id: policyWorkflowId,
      workspaceId,
      name: "Operational policy test",
      triggerEvent: "application.created",
      trigger: { event: "application.created" },
      conditions: [],
      actions: [],
      maxExternalActionsPerMinute: 1,
      circuitBreakerThreshold: 2,
      circuitBreakerCooldownSeconds: 60,
    });
    await client!.db.insert(workflowRuns).values({
      id: rootRunId,
      rootRunId,
      workspaceId,
      workflowId: policyWorkflowId,
      triggerEvent: "application.created",
      engineVersion: 1,
      status: "succeeded",
      finishedAt: new Date(),
    });

    const now = new Date("2099-01-01T12:00:20.000Z");
    const [first, second] = await Promise.all([
      reserveExternalActionPolicy({
        workspaceId,
        workflowId: policyWorkflowId,
        runId: rootRunId,
        database: client!.db,
        now,
      }),
      reserveExternalActionPolicy({
        workspaceId,
        workflowId: policyWorkflowId,
        runId: rootRunId,
        database: client!.db,
        now,
      }),
    ]);
    expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
    expect([first, second].find((result) => !result.ok)).toMatchObject({
      code: "EXTERNAL_RATE_LIMITED",
    });

    const [root] = await client!.db
      .select({ used: workflowRuns.lineageExternalActions })
      .from(workflowRuns)
      .where(eq(workflowRuns.id, rootRunId));
    expect(root?.used).toBe(1);
    const [bucket] = await client!.db
      .select({ reserved: workflowExternalActionBuckets.reserved })
      .from(workflowExternalActionBuckets)
      .where(eq(workflowExternalActionBuckets.workflowId, policyWorkflowId));
    expect(bucket?.reserved).toBe(1);

    async function createExternalWorkflow() {
      const externalWorkflowId = randomUUID();
      const externalRunId = randomUUID();
      await client!.db.insert(workflowDefinitions).values({
        id: externalWorkflowId,
        workspaceId,
        name: "Workspace external quota test",
        triggerEvent: "application.created",
        trigger: { event: "application.created" },
        conditions: [],
        actions: [],
        maxExternalActionsPerMinute: 10,
      });
      await client!.db.insert(workflowRuns).values({
        id: externalRunId,
        rootRunId: externalRunId,
        workspaceId,
        workflowId: externalWorkflowId,
        triggerEvent: "application.created",
        engineVersion: 1,
      });
      return { workflowId: externalWorkflowId, runId: externalRunId };
    }
    const secondWorkflow = await createExternalWorkflow();
    expect(
      await reserveExternalActionPolicy({
        workspaceId,
        ...secondWorkflow,
        database: client!.db,
        now,
      }),
    ).toMatchObject({ ok: true });
    const thirdWorkflow = await createExternalWorkflow();
    expect(
      await reserveExternalActionPolicy({
        workspaceId,
        ...thirdWorkflow,
        database: client!.db,
        now,
      }),
    ).toMatchObject({ ok: false, code: "WORKSPACE_EXTERNAL_RATE_LIMITED" });
    const [workspaceBucket] = await client!.db
      .select({ reserved: workspaceAutomationExternalActionBuckets.reserved })
      .from(workspaceAutomationExternalActionBuckets)
      .where(eq(workspaceAutomationExternalActionBuckets.workspaceId, workspaceId));
    expect(workspaceBucket?.reserved).toBe(2);

    await recordExternalActionOutcome({
      workspaceId,
      workflowId: policyWorkflowId,
      outcome: "failed",
      database: client!.db,
    });
    await recordExternalActionOutcome({
      workspaceId,
      workflowId: policyWorkflowId,
      outcome: "uncertain",
      database: client!.db,
    });
    const [definition] = await client!.db
      .select({
        failures: workflowDefinitions.consecutiveFailureCount,
        openUntil: workflowDefinitions.circuitOpenUntil,
      })
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.id, policyWorkflowId));
    expect(definition?.failures).toBe(2);
    expect(definition?.openUntil?.getTime()).toBeGreaterThan(Date.now());
    await client!.db
      .update(workspaceAutomationPolicies)
      .set({ maxExternalActionsPerMinute: 150 })
      .where(eq(workspaceAutomationPolicies.workspaceId, workspaceId));
    await client!.db
      .update(workflowRuns)
      .set({ status: "succeeded", finishedAt: new Date() })
      .where(
        and(
          eq(workflowRuns.workspaceId, workspaceId),
          eq(workflowRuns.engineVersion, 1),
        ),
      );
  });

  it("refunds a reservation rejected by the pause gate without refunding a started effect", async () => {
    const policyWorkflowId = randomUUID();
    const rootRunId = randomUUID();
    const now = new Date("2099-01-01T12:10:20.000Z");
    await client!.db
      .insert(workspaceAutomationPolicies)
      .values({
        workspaceId,
        enabled: true,
        maxExternalActionsPerMinute: 2,
      })
      .onConflictDoUpdate({
        target: workspaceAutomationPolicies.workspaceId,
        set: { enabled: true, maxExternalActionsPerMinute: 2 },
      });
    await client!.db.insert(workflowDefinitions).values({
      id: policyWorkflowId,
      workspaceId,
      name: "Pause gate refund test",
      triggerEvent: "application.created",
      trigger: { event: "application.created" },
      conditions: [],
      actions: [],
      maxExternalActionsPerMinute: 2,
    });
    await client!.db.insert(workflowRuns).values({
      id: rootRunId,
      rootRunId,
      workspaceId,
      workflowId: policyWorkflowId,
      triggerEvent: "application.created",
      engineVersion: 1,
      status: "succeeded",
      finishedAt: new Date(),
    });

    const rejectedReservation = await reserveExternalActionPolicy({
      workspaceId,
      workflowId: policyWorkflowId,
      runId: rootRunId,
      database: client!.db,
      now,
    });
    expect(rejectedReservation.ok).toBe(true);
    if (!rejectedReservation.ok) throw new Error("Expected reservation");
    await client!.db
      .update(workspaceAutomationPolicies)
      .set({ enabled: false })
      .where(eq(workspaceAutomationPolicies.workspaceId, workspaceId));
    let rejectedEffectCalled = false;
    expect(
      await withWorkspaceAutomationEffectPermit({
        workspaceId,
        database: client!.db,
        effect: async () => {
          rejectedEffectCalled = true;
        },
      }),
    ).toEqual({ started: false });
    expect(rejectedEffectCalled).toBe(false);
    await releaseUnstartedExternalActionReservation({
      workspaceId,
      workflowId: policyWorkflowId,
      receipt: rejectedReservation.receipt,
      database: client!.db,
    });
    await releaseUnstartedExternalActionReservation({
      workspaceId,
      workflowId: policyWorkflowId,
      receipt: rejectedReservation.receipt,
      database: client!.db,
    });
    const [refundedWorkspaceBucket] = await client!.db
      .select({ reserved: workspaceAutomationExternalActionBuckets.reserved })
      .from(workspaceAutomationExternalActionBuckets)
      .where(
        and(
          eq(workspaceAutomationExternalActionBuckets.workspaceId, workspaceId),
          eq(
            workspaceAutomationExternalActionBuckets.bucketStart,
            rejectedReservation.receipt.bucketStart,
          ),
        ),
      );
    const [refundedWorkflowBucket] = await client!.db
      .select({ reserved: workflowExternalActionBuckets.reserved })
      .from(workflowExternalActionBuckets)
      .where(
        and(
          eq(workflowExternalActionBuckets.workflowId, policyWorkflowId),
          eq(
            workflowExternalActionBuckets.bucketStart,
            rejectedReservation.receipt.bucketStart,
          ),
        ),
      );
    const [refundedRoot] = await client!.db
      .select({ used: workflowRuns.lineageExternalActions })
      .from(workflowRuns)
      .where(eq(workflowRuns.id, rootRunId));
    expect(refundedWorkspaceBucket?.reserved).toBe(0);
    expect(refundedWorkflowBucket?.reserved).toBe(0);
    expect(refundedRoot?.used).toBe(0);

    await client!.db
      .update(workspaceAutomationPolicies)
      .set({ enabled: true })
      .where(eq(workspaceAutomationPolicies.workspaceId, workspaceId));
    const admittedReservation = await reserveExternalActionPolicy({
      workspaceId,
      workflowId: policyWorkflowId,
      runId: rootRunId,
      database: client!.db,
      now,
    });
    expect(admittedReservation.ok).toBe(true);
    let admittedEffectCalled = false;
    expect(
      await withWorkspaceAutomationEffectPermit({
        workspaceId,
        database: client!.db,
        effect: async () => {
          admittedEffectCalled = true;
        },
      }),
    ).toEqual({ started: true, value: undefined });
    expect(admittedEffectCalled).toBe(true);
    const [admittedWorkspaceBucket] = await client!.db
      .select({ reserved: workspaceAutomationExternalActionBuckets.reserved })
      .from(workspaceAutomationExternalActionBuckets)
      .where(
        and(
          eq(workspaceAutomationExternalActionBuckets.workspaceId, workspaceId),
          eq(
            workspaceAutomationExternalActionBuckets.bucketStart,
            rejectedReservation.receipt.bucketStart,
          ),
        ),
      );
    const [admittedWorkflowBucket] = await client!.db
      .select({ reserved: workflowExternalActionBuckets.reserved })
      .from(workflowExternalActionBuckets)
      .where(
        and(
          eq(workflowExternalActionBuckets.workflowId, policyWorkflowId),
          eq(
            workflowExternalActionBuckets.bucketStart,
            rejectedReservation.receipt.bucketStart,
          ),
        ),
      );
    const [admittedRoot] = await client!.db
      .select({ used: workflowRuns.lineageExternalActions })
      .from(workflowRuns)
      .where(eq(workflowRuns.id, rootRunId));
    expect(admittedWorkspaceBucket?.reserved).toBe(1);
    expect(admittedWorkflowBucket?.reserved).toBe(1);
    expect(admittedRoot?.used).toBe(1);
  });

  it("prunes expired refund receipts without deleting fresh idempotency records", async () => {
    const workflowId = randomUUID();
    const rootRunId = randomUUID();
    const now = new Date();
    const oldRefundId = randomUUID();
    const secondOldRefundId = randomUUID();
    const freshRefundId = randomUUID();
    await client!.db.insert(workflowDefinitions).values({
      id: workflowId,
      workspaceId,
      name: "Refund cleanup test",
      triggerEvent: "application.created",
      trigger: { event: "application.created" },
      conditions: [],
      actions: [],
    });
    await client!.db.insert(workflowRuns).values({
      id: rootRunId,
      rootRunId,
      workspaceId,
      workflowId,
      triggerEvent: "application.created",
      engineVersion: 1,
      status: "succeeded",
      finishedAt: now,
    });
    await client!.db.insert(workflowExternalActionRefunds).values([
      {
        reservationId: oldRefundId,
        workspaceId,
        workflowId,
        rootRunId,
        bucketStart: now,
        refundedAt: new Date(now.getTime() - 26 * 60 * 60_000),
      },
      {
        reservationId: secondOldRefundId,
        workspaceId,
        workflowId,
        rootRunId,
        bucketStart: now,
        refundedAt: new Date(now.getTime() - 25 * 60 * 60_000),
      },
      {
        reservationId: freshRefundId,
        workspaceId,
        workflowId,
        rootRunId,
        bucketStart: now,
        refundedAt: new Date(now.getTime() - 23 * 60 * 60_000),
      },
    ]);

    expect(
      await cleanupExpiredWorkspaceAutomationBuckets({
        database: client!.db,
        limit: 1,
        now,
      }),
    ).toBeGreaterThanOrEqual(1);
    let retained = await client!.db
      .select({ reservationId: workflowExternalActionRefunds.reservationId })
      .from(workflowExternalActionRefunds)
      .where(
        inArray(workflowExternalActionRefunds.reservationId, [
          oldRefundId,
          secondOldRefundId,
          freshRefundId,
        ]),
      );
    expect(retained.map((row) => row.reservationId).sort()).toEqual(
      [secondOldRefundId, freshRefundId].sort(),
    );

    expect(
      await cleanupExpiredWorkspaceAutomationBuckets({
        database: client!.db,
        limit: 1,
        now,
      }),
    ).toBeGreaterThanOrEqual(1);
    retained = await client!.db
      .select({ reservationId: workflowExternalActionRefunds.reservationId })
      .from(workflowExternalActionRefunds)
      .where(
        eq(workflowExternalActionRefunds.reservationId, freshRefundId),
      );
    expect(retained).toHaveLength(1);
  });

  it("enforces workspace run ceilings and pause status across workflows", async () => {
    await client!.db
      .insert(workspaceAutomationPolicies)
      .values({ workspaceId, maxRunsPerMinute: 1 })
      .onConflictDoUpdate({
        target: workspaceAutomationPolicies.workspaceId,
        set: { enabled: true, maxRunsPerMinute: 1 },
      });
    const firstWorkflowId = randomUUID();
    const secondWorkflowId = randomUUID();
    await client!.db.insert(workflowDefinitions).values([
      {
        id: firstWorkflowId,
        workspaceId,
        name: "Workspace run quota one",
        triggerEvent: "application.created",
        trigger: { event: "application.created" },
        conditions: [],
        actions: [],
        maxRunsPerMinute: 10,
      },
      {
        id: secondWorkflowId,
        workspaceId,
        name: "Workspace run quota two",
        triggerEvent: "application.created",
        trigger: { event: "application.created" },
        conditions: [],
        actions: [],
        maxRunsPerMinute: 10,
      },
    ]);
    const now = new Date("2099-01-01T13:00:20.000Z");
    const first = await reserveRunAdmissionPolicy({
      workspaceId,
      workflowId: firstWorkflowId,
      maxRunsPerMinute: 10,
      circuitOpenUntil: null,
      database: client!.db,
      now,
    });
    const second = await reserveRunAdmissionPolicy({
      workspaceId,
      workflowId: secondWorkflowId,
      maxRunsPerMinute: 10,
      circuitOpenUntil: null,
      database: client!.db,
      now,
    });
    expect(first).toEqual({ ok: true });
    expect(second).toMatchObject({ ok: false, code: "WORKSPACE_RUN_RATE_LIMITED" });
    const [bucket] = await client!.db
      .select({ reserved: workspaceAutomationRunBuckets.reserved })
      .from(workspaceAutomationRunBuckets)
      .where(eq(workspaceAutomationRunBuckets.workspaceId, workspaceId));
    expect(bucket?.reserved).toBe(1);

    await client!.db
      .update(workspaceAutomationPolicies)
      .set({
        enabled: false,
        pausedAt: new Date(),
        pausedById: fixtureUserId,
        pauseReason: "Integration pause test",
      })
      .where(eq(workspaceAutomationPolicies.workspaceId, workspaceId));
    expect(await workspaceAutomationsEnabled(workspaceId, client!.db)).toBe(false);
    expect(
      await reserveRunAdmissionPolicy({
        workspaceId,
        workflowId: firstWorkflowId,
        maxRunsPerMinute: 10,
        circuitOpenUntil: null,
        database: client!.db,
        now: new Date("2099-01-01T13:01:20.000Z"),
      }),
    ).toMatchObject({ ok: false, code: "WORKSPACE_PAUSED" });
    await client!.db
      .update(workspaceAutomationPolicies)
      .set({ enabled: true, pausedAt: null, pausedById: null, pauseReason: null })
      .where(eq(workspaceAutomationPolicies.workspaceId, workspaceId));
    await client!.db
      .update(workspaceAutomationPolicies)
      .set({ maxRunsPerMinute: 300 })
      .where(eq(workspaceAutomationPolicies.workspaceId, workspaceId));
  });

  it("serializes workspace pause against effect start", async () => {
    await client!.db
      .insert(workspaceAutomationPolicies)
      .values({ workspaceId, enabled: true })
      .onConflictDoUpdate({
        target: workspaceAutomationPolicies.workspaceId,
        set: { enabled: true },
      });

    let effectStarted!: () => void;
    let releaseEffect!: () => void;
    const effectStartedSignal = new Promise<void>((resolve) => {
      effectStarted = resolve;
    });
    const effectBarrier = new Promise<void>((resolve) => {
      releaseEffect = resolve;
    });
    const effect = withWorkspaceAutomationEffectPermit({
      workspaceId,
      database: client!.db,
      effect: async () => {
        effectStarted();
        await effectBarrier;
        return "provider-call-finished";
      },
    });
    await effectStartedSignal;

    let pauseReturned = false;
    const pause = client!.db
      .update(workspaceAutomationPolicies)
      .set({
        enabled: false,
        pausedAt: new Date(),
        pausedById: fixtureUserId,
        pauseReason: "Barrier test",
      })
      .where(eq(workspaceAutomationPolicies.workspaceId, workspaceId))
      .then(() => {
        pauseReturned = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(pauseReturned).toBe(false);

    releaseEffect();
    await expect(effect).resolves.toEqual({
      started: true,
      value: "provider-call-finished",
    });
    await pause;
    expect(pauseReturned).toBe(true);

    let calledAfterPause = false;
    await expect(
      withWorkspaceAutomationEffectPermit({
        workspaceId,
        database: client!.db,
        effect: async () => {
          calledAfterPause = true;
        },
      }),
    ).resolves.toEqual({ started: false });
    expect(calledAfterPause).toBe(false);
    await client!.db
      .update(workspaceAutomationPolicies)
      .set({ enabled: true, pausedAt: null, pausedById: null, pauseReason: null })
      .where(eq(workspaceAutomationPolicies.workspaceId, workspaceId));
  });

  it("limits simultaneous run leases and does not count waiting runs", async () => {
    await client!.db
      .insert(workspaceAutomationPolicies)
      .values({ workspaceId, maxConcurrentRuns: 1 })
      .onConflictDoUpdate({
        target: workspaceAutomationPolicies.workspaceId,
        set: { enabled: true, maxConcurrentRuns: 1 },
      });
    const firstRunId = await run();
    const secondRunId = await run();
    const leases = graphRunLeases(client!.db);
    const [firstClaim, secondClaim] = await Promise.all([
      leases.claim({ workspaceId, runId: firstRunId, workerId: "workspace-one" }),
      leases.claim({ workspaceId, runId: secondRunId, workerId: "workspace-two" }),
    ]);
    expect([firstClaim, secondClaim].filter(Boolean)).toHaveLength(1);
    const waitingClaim = firstClaim ?? secondClaim;
    const deferredRunId = firstClaim ? secondRunId : firstRunId;
    expect(await leases.release(waitingClaim!, "waiting")).toBe(true);
    await client!.db
      .update(workflowRuns)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(workflowRuns.id, deferredRunId));
    const nextClaim = await leases.claim({
      workspaceId,
      runId: deferredRunId,
      workerId: "workspace-after-wait",
    });
    expect(nextClaim).not.toBeNull();
    expect(await leases.release(nextClaim!, "waiting")).toBe(true);
    await client!.db
      .update(workspaceAutomationPolicies)
      .set({ maxConcurrentRuns: 20 })
      .where(eq(workspaceAutomationPolicies.workspaceId, workspaceId));
  });

  it("retains old domain events until every applicable durable consumer acknowledges them", async () => {
    const old = new Date(Date.now() - 60_000);
    await client!.db.insert(domainEventOutbox).values([
      {
        workspaceId,
        eventName: "application.created",
        eventVersion: 1,
        schemaVersion: 1,
        payload: { case: "pending-workflow" },
        createdAt: old,
      },
      {
        workspaceId,
        eventName: "application.created",
        eventVersion: 1,
        schemaVersion: 1,
        payload: { case: "workflow-not-dispatched" },
        publishedAt: old,
        createdAt: old,
      },
      {
        workspaceId,
        eventName: "application.created",
        eventVersion: 1,
        schemaVersion: 1,
        payload: { case: "fully-consumed-workflow" },
        publishedAt: old,
        automationsDispatchedAt: old,
        createdAt: old,
      },
      {
        workspaceId,
        eventName: "event.not_a_workflow_trigger",
        eventVersion: 1,
        schemaVersion: 1,
        payload: { case: "unpublished-non-workflow" },
        createdAt: old,
      },
      {
        workspaceId,
        eventName: "event.not_a_workflow_trigger",
        eventVersion: 1,
        schemaVersion: 1,
        payload: { case: "published-non-workflow" },
        publishedAt: old,
        createdAt: old,
      },
    ]);

    expect(
      await pruneDomainEventOutbox({
        retentionDays: 0,
        database: client!.db,
        workspaceId,
      }),
    ).toBe(2);

    const survivors = await client!.db
      .select({ payload: domainEventOutbox.payload })
      .from(domainEventOutbox)
      .where(eq(domainEventOutbox.workspaceId, workspaceId));
    expect(
      survivors.map((row) => (row.payload as { case: string }).case).sort(),
    ).toEqual([
      "pending-workflow",
      "unpublished-non-workflow",
      "workflow-not-dispatched",
    ]);
  });

  it("allows exactly one of concurrent claimants", async () => {
    const repo = graphRunLeases(client!.db);
    const runId = await run();
    const claims = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        repo.claim({ workspaceId, runId, workerId: `worker-${i}` }),
      ),
    );
    const winners = claims.filter((lease) => lease !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0]!.fenceToken).toBe(1);
  });
  it("rejects old fences after a lease expires and is reclaimed", async () => {
    const repo = graphRunLeases(client!.db);
    const runId = await run();
    const first = await repo.claim({ workspaceId, runId, workerId: "first" });
    expect(first).not.toBeNull();
    await client!.db
      .update(workflowRuns)
      .set({ leaseUntil: expression`now() - interval '1 second'` })
      .where(eq(workflowRuns.id, runId));
    expect(await repo.renew(first!)).toBe(false);
    const second = await repo.claim({ workspaceId, runId, workerId: "second" });
    expect(second!.fenceToken).toBe(2);
    expect(await repo.release(first!, "queued")).toBe(false);
    expect(await repo.renew(second!)).toBe(true);
    expect(await repo.release(second!, "waiting")).toBe(true);
    expect(
      await repo.claim({ workspaceId, runId, workerId: "third" }),
    ).toBeNull();
  });
  it("does not claim legacy runs or another workspace's run", async () => {
    const repo = graphRunLeases(client!.db);
    expect(
      await repo.claim({
        workspaceId,
        runId: await run(1),
        workerId: "worker",
      }),
    ).toBeNull();
    expect(
      await repo.claim({
        workspaceId: otherWorkspaceId,
        runId: await run(),
        workerId: "worker",
      }),
    ).toBeNull();
  });
  it("publishes and dispatches a non-linear approval graph through v2 without using its lossy legacy projection", async () => {
    const {
      createWorkflowWithDraft,
      saveWorkflowDraft,
      requestDraftApproval,
      approveDraft,
      publishDraft,
    } = await import("../definition/service");
    const graph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          event: "application.created",
          filter: {},
        },
        {
          id: "approval",
          type: "approval",
          eligibleActorIds: [fixtureSecondUserId],
          rule: "any",
          deadlineHours: 24,
        },
        {
          id: "note",
          type: "action",
          actionType: "add_note",
          toolVersion: 1,
          failurePolicy: "stop",
          input: { body: { kind: "literal", value: "Approved" } },
        },
        { id: "completed", type: "end", result: "completed" },
        { id: "rejected", type: "end", result: "stopped" },
        { id: "expired", type: "end", result: "stopped" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "approval" },
        { id: "e2", source: "approval", port: "approved", target: "note" },
        { id: "e3", source: "approval", port: "rejected", target: "rejected" },
        { id: "e4", source: "approval", port: "expired", target: "expired" },
        { id: "e5", source: "note", port: "success", target: "completed" },
      ],
    };
    const draft = await createWorkflowWithDraft({
      workspaceId,
      createdById: fixtureUserId,
      values: {
        name: `Non-linear publication ${randomUUID()}`,
        enabled: false,
        trigger: { event: "application.created", filter: {} },
        conditions: [],
        actions: [],
      },
      graph,
      database: client!.db,
    });
    const editedGraph = structuredClone(graph);
    const noteNode = editedGraph.nodes.find(
      (node) => node.type === "action" && node.actionType === "add_note",
    );
    if (
      !noteNode ||
      noteNode.type !== "action" ||
      noteNode.input.body?.kind !== "literal"
    ) {
      throw new Error("Missing note action fixture.");
    }
    noteNode.input.body.value = "Latest saved revision";
    const saved = await saveWorkflowDraft({
      workspaceId,
      id: draft.id,
      patch: {},
      expectedRevision: draft.draftRevision,
      graph: editedGraph,
      database: client!.db,
    });
    await expect(
      requestDraftApproval({
        workspaceId,
        id: draft.id,
        requesterId: fixtureUserId,
        expectedRevision: draft.draftRevision,
        database: client!.db,
      }),
    ).rejects.toThrow(/draft changed/i);
    const requested = await requestDraftApproval({
      workspaceId,
      id: draft.id,
      requesterId: fixtureUserId,
      expectedRevision: saved.draftRevision,
      database: client!.db,
    });
    await expect(
      approveDraft({
        workspaceId,
        id: draft.id,
        approverId: fixtureUserId,
        expectedRevision: requested.draftRevision,
        database: client!.db,
      }),
    ).rejects.toThrow(/requested this review cannot approve/i);
    const approved = await approveDraft({
      workspaceId,
      id: draft.id,
      approverId: fixtureSecondUserId,
      expectedRevision: requested.draftRevision,
      database: client!.db,
    });
    const published = await publishDraft({
      workspaceId,
      id: draft.id,
      publisherId: fixtureUserId,
      expectedRevision: approved.draftRevision,
      database: client!.db,
    });

    expect(published.engineVersion).toBe(2);
    expect(published.enabled).toBe(true);
    expect(published.actions).toEqual([]);
    const [version] = await client!.db
      .select()
      .from(workflowDefinitionVersions)
      .where(eq(workflowDefinitionVersions.id, published.publishedVersionId!))
      .limit(1);
    expect(version?.graph).toEqual(editedGraph);

    const { dispatchWorkflowEvent } = await import("../dispatch");
    const sourceEventId = randomUUID();
    expect(
      await dispatchWorkflowEvent(
        workspaceId,
        "application.created",
        { application: { id: fixtureApplicationId }, eventId: sourceEventId },
        { sourceEventId, database: client!.db },
      ),
    ).toBe(true);
    const [dispatchedRun] = await client!.db
      .select({
        engineVersion: workflowRuns.engineVersion,
        versionId: workflowRuns.versionId,
      })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.workspaceId, workspaceId),
          eq(workflowRuns.workflowId, draft.id),
          eq(workflowRuns.sourceEventId, sourceEventId),
        ),
      )
      .limit(1);
    expect(dispatchedRun).toEqual({
      engineVersion: 2,
      versionId: published.publishedVersionId,
    });
  });
  it("rejects schema-invalid action bindings at the transactional approval boundary", async () => {
    const { createWorkflowWithDraft, requestDraftApproval } =
      await import("../definition/service");
    const invalidGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          event: "application.created",
          filter: {},
        },
        {
          id: "note",
          type: "action",
          actionType: "add_note",
          toolVersion: 1,
          failurePolicy: "stop",
          input: { body: { kind: "literal", value: "   " } },
        },
        { id: "done", type: "end", result: "completed" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "note" },
        { id: "e2", source: "note", port: "success", target: "done" },
      ],
    };
    const draft = await createWorkflowWithDraft({
      workspaceId,
      createdById: fixtureUserId,
      values: {
        name: `Invalid tool config ${randomUUID()}`,
        enabled: false,
        trigger: { event: "application.created", filter: {} },
        conditions: [],
        actions: [],
      },
      graph: invalidGraph,
      database: client!.db,
    });

    await expect(
      requestDraftApproval({
        workspaceId,
        id: draft.id,
        requesterId: fixtureUserId,
        expectedRevision: draft.draftRevision,
        database: client!.db,
      }),
    ).rejects.toThrow(/isn't ready to publish/i);
  });

  it("dispatches a worker-originated event into the injected database", async () => {
    // Import dispatch only after the guarded integration setup has established
    // the runtime URL. Keeping this server-module import lazy prevents the
    // optional integration suite from changing the environment requirements of
    // the ordinary unit-test collection order.
    const { dispatchWorkflowEvent } = await import("../dispatch");
    const dispatchedWorkflowId = randomUUID();
    const dispatchedVersionId = randomUUID();
    const dispatchedGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        { id: "trigger", type: "trigger", event: "application.created" },
        { id: "end", type: "end", result: "completed" },
      ],
      edges: [
        { id: "dispatch-next", source: "trigger", port: "next", target: "end" },
      ],
    };
    await client!.db.insert(workflowDefinitions).values({
      id: dispatchedWorkflowId,
      workspaceId,
      name: "Injected dispatch test",
      triggerEvent: "application.created",
      trigger: { event: "application.created" },
      conditions: [],
      actions: [],
      enabled: true,
      status: "published",
      engineVersion: 2,
      publishedVersionId: dispatchedVersionId,
    });
    await client!.db.insert(workflowDefinitionVersions).values({
      id: dispatchedVersionId,
      workflowId: dispatchedWorkflowId,
      workspaceId,
      name: "Injected dispatch test",
      version: 1,
      schemaVersion: 2,
      graph: dispatchedGraph,
      contentHash: semanticGraphHash(dispatchedGraph),
      publishedAt: new Date(),
      createdById: fixtureUserId,
      triggerEvent: "application.created",
      trigger: {},
      conditions: [],
      actions: [],
    });

    const sourceEventId = randomUUID();
    expect(
      await dispatchWorkflowEvent(
        workspaceId,
        "application.created",
        { application: { id: fixtureApplicationId }, eventId: sourceEventId },
        { sourceEventId, database: client!.db },
      ),
    ).toBe(true);

    const [createdRun] = await client!.db
      .select({
        engineVersion: workflowRuns.engineVersion,
        versionId: workflowRuns.versionId,
      })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.workspaceId, workspaceId),
          eq(workflowRuns.workflowId, dispatchedWorkflowId),
          eq(workflowRuns.sourceEventId, sourceEventId),
        ),
      )
      .limit(1);
    expect(createdRun).toEqual({
      engineVersion: 2,
      versionId: dispatchedVersionId,
    });
  });
  it("cancellation invalidates renewal and further advancement", async () => {
    const repo = graphRunLeases(client!.db);
    const runId = await run();
    const lease = await repo.claim({ workspaceId, runId, workerId: "worker" });
    await client!.db
      .update(workflowRuns)
      .set({ cancelRequestedAt: new Date() })
      .where(eq(workflowRuns.id, runId));
    expect(await repo.renew(lease!)).toBe(false);
    expect(await repo.release(lease!, "queued")).toBe(false);
  });
  it("recovers an expired cancelled run without invoking an action", async () => {
    const runId = await run();
    const first = (await graphRunLeases(client!.db).claim({
      workspaceId,
      runId,
      workerId: "cancelled-worker",
    }))!;
    await client!.db
      .update(workflowRuns)
      .set({
        cancelRequestedAt: new Date(),
        leaseUntil: expression`now() - interval '1 second'`,
      })
      .where(eq(workflowRuns.id, runId));
    expect(
      await graphRunLeases(client!.db).claim({
        workspaceId,
        runId,
        workerId: "normal-recovery-worker",
      }),
    ).toBeNull();

    let invoked = false;
    const result = await runWorkflowV2(runId, {
      database: client!.db,
      workerId: "cancel-recovery-worker",
      actionAdapter: {
        execute: async () => {
          invoked = true;
          return { status: "succeeded", output: {} };
        },
      },
    });

    expect(result).toMatchObject({ status: "cancelled" });
    expect(invoked).toBe(false);
    expect(first.fenceToken).toBe(1);
    const [persisted] = await client!.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId));
    expect(persisted).toMatchObject({
      logicalStatus: "cancelled",
      status: "cancelled",
      lockedBy: null,
      leaseUntil: null,
    });
    expect(persisted?.finishedAt).not.toBeNull();
  });
  it("keeps document packages independent on the same application", async () => {
    const first = await createDocumentRequestsForWorkflow({
      database: client!.db,
      workspaceId,
      actorUserId: fixtureUserId,
      applicationId: fixtureApplicationId,
      items: [{ title: "Identity document" }],
      effectKey: "workflow:package:first",
    });
    const second = await createDocumentRequestsForWorkflow({
      database: client!.db,
      workspaceId,
      actorUserId: fixtureUserId,
      applicationId: fixtureApplicationId,
      items: [{ title: "Tax form" }],
      effectKey: "workflow:package:second",
    });
    if (!first.ok) throw new Error(`First package failed: ${first.error}`);
    if (!second.ok) throw new Error(`Second package failed: ${second.error}`);
    if (!first.ok || !second.ok)
      throw new Error("Package fixture creation failed");
    expect(first.packageId).not.toBe(second.packageId);
    expect(first.requestIds).not.toEqual(second.requestIds);

    await client!.db
      .update(documentRequests)
      .set({ status: "accepted" })
      .where(eq(documentRequests.id, first.requestIds[0]!));
    await client!.db.transaction(async (tx) => {
      expect(
        await reconcileDocumentRequestPackage(tx, {
          workspaceId,
          packageId: first.packageId,
        }),
      ).toBe("completed");
    });
    const packages = await client!.db
      .select({
        id: documentRequestPackages.id,
        status: documentRequestPackages.status,
      })
      .from(documentRequestPackages)
      .where(eq(documentRequestPackages.workspaceId, workspaceId));
    expect(packages.find((row) => row.id === first.packageId)?.status).toBe(
      "completed",
    );
    expect(packages.find((row) => row.id === second.packageId)?.status).toBe(
      "pending",
    );

    const reused = await createDocumentRequestsForWorkflow({
      database: client!.db,
      workspaceId,
      actorUserId: fixtureUserId,
      applicationId: fixtureApplicationId,
      items: [{ title: "A different title must not duplicate" }],
      effectKey: "workflow:package:first",
    });
    expect(reused).toMatchObject({
      ok: true,
      packageId: first.packageId,
      reused: true,
      requestIds: first.requestIds,
    });
  });
  it("serializes concurrent item completion when recalculating a package", async () => {
    const created = await createDocumentRequestsForWorkflow({
      database: client!.db,
      workspaceId,
      actorUserId: fixtureUserId,
      applicationId: fixtureApplicationId,
      items: [{ title: "Identity" }, { title: "Tax form" }],
      effectKey: `workflow:package:concurrency:${randomUUID()}`,
    });
    if (!created.ok)
      throw new Error(`Package fixture creation failed: ${created.error}`);

    await Promise.all(
      created.requestIds.map((requestId) =>
        client!.db.transaction(async (tx) => {
          await tx
            .update(documentRequests)
            .set({ status: "accepted" })
            .where(eq(documentRequests.id, requestId));
          await reconcileDocumentRequestPackage(tx, {
            workspaceId,
            packageId: created.packageId,
          });
        }),
      ),
    );

    const [packageRow] = await client!.db
      .select({ status: documentRequestPackages.status })
      .from(documentRequestPackages)
      .where(eq(documentRequestPackages.id, created.packageId));
    expect(packageRow?.status).toBe("completed");
  });
  it("resumes a document package wait by package identity", async () => {
    const created = await createDocumentRequestsForWorkflow({
      database: client!.db,
      workspaceId,
      actorUserId: fixtureUserId,
      applicationId: fixtureApplicationId,
      items: [{ title: "Signed agreement" }],
      effectKey: `workflow:package:resume:${randomUUID()}`,
    });
    if (!created.ok)
      throw new Error(`Package fixture creation failed: ${created.error}`);

    const customGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          event: "application.created",
          filter: {},
        },
        {
          id: "wait",
          type: "wait",
          kind: "document_package",
          resourceId: { kind: "literal", value: created.packageId },
        },
        { id: "completed", type: "end", result: "completed" },
        { id: "expired", type: "end", result: "stopped" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "wait" },
        { id: "e2", source: "wait", port: "completed", target: "completed" },
        { id: "e3", source: "wait", port: "declined", target: "expired" },
        { id: "e4", source: "wait", port: "cancelled", target: "expired" },
        { id: "e5", source: "wait", port: "expired", target: "expired" },
      ],
    };
    const runId = await runGraph(customGraph);
    expect((await runWorkflowV2(runId, { database: client!.db })).status).toBe(
      "waiting",
    );
    await client!.db
      .update(documentRequestPackages)
      .set({
        status: "completed",
        completedAt: new Date(),
        resolvedAt: new Date(),
      })
      .where(eq(documentRequestPackages.id, created.packageId));
    // Simulate a lost callback: the package is terminal while the original
    // document deadline is still in the future. The worker must wake from the
    // canonical package state, not from nextAttemptAt.
    expect(
      (
        await runWorkflowV2(runId, {
          database: client!.db,
          workerId: "package-recovery-worker",
        })
      ).status,
    ).toBe("succeeded");
    const [persisted] = await client!.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId));
    expect(persisted?.logicalStatus).toBe("succeeded");
  });
  it("expires a due document package and resumes its expired branch", async () => {
    const created = await createDocumentRequestsForWorkflow({
      database: client!.db,
      workspaceId,
      actorUserId: fixtureUserId,
      applicationId: fixtureApplicationId,
      items: [{ title: "Time-sensitive document" }],
      dueAt: new Date(Date.now() - 60_000),
      effectKey: `workflow:package:expiry:${randomUUID()}`,
    });
    if (!created.ok)
      throw new Error(`Package fixture creation failed: ${created.error}`);

    const customGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          event: "application.created",
          filter: {},
        },
        {
          id: "wait",
          type: "wait",
          kind: "document_package",
          resourceId: { kind: "literal", value: created.packageId },
        },
        { id: "expired", type: "end", result: "stopped" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "wait" },
        { id: "e2", source: "wait", port: "completed", target: "expired" },
        { id: "e3", source: "wait", port: "declined", target: "expired" },
        { id: "e4", source: "wait", port: "cancelled", target: "expired" },
        { id: "e5", source: "wait", port: "expired", target: "expired" },
      ],
    };
    const runId = await runGraph(customGraph);
    expect((await runWorkflowV2(runId, { database: client!.db })).status).toBe(
      "waiting",
    );
    const expired = await expireOverdueDocumentRequestPackages(client!.db);
    expect(expired).toContainEqual({
      workspaceId,
      packageId: created.packageId,
    });
    expect(
      await resumeWorkflowDocumentWaits(
        { workspaceId, resourceId: created.packageId },
        client!.db,
      ),
    ).toBe(1);
    const [persisted] = await client!.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId));
    expect(persisted?.logicalStatus).toBe("stopped");
  });
  it("reserves one attempt and freezes its input across duplicate requests", async () => {
    const repo = graphRunLeases(client!.db);
    const store = graphNodeStore(client!.db);
    const lease = (await repo.claim({
      workspaceId,
      runId: await run(),
      workerId: "worker",
    }))!;
    const first = await store.reserve(lease, "action", { body: "original" });
    expect(first?.kind).toBe("reserved");
    const duplicate = await store.reserve(lease, "action", { body: "changed" });
    expect(duplicate?.kind).toBe("existing");
    expect(duplicate?.execution.inputSnapshot).toEqual({ body: "original" });
    expect(duplicate?.execution.effectKey).toBe(first?.execution.effectKey);
    if (first?.kind !== "reserved") throw new Error("Reservation failed");
    expect(
      await store.settle(lease, first.execution.id, first.attemptId, {
        status: "succeeded",
        output: { id: "note" },
      }),
    ).toBe(true);
    expect(
      await store.settle(lease, first.execution.id, first.attemptId, {
        status: "failed",
        code: "LATE",
      }),
    ).toBe(false);
    const completed = await store.reserve(lease, "action", {});
    expect(completed?.execution.output).toEqual({ id: "note" });
  });
  it("does not persist results from a reclaimed worker", async () => {
    const repo = graphRunLeases(client!.db);
    const store = graphNodeStore(client!.db);
    const runId = await run();
    const first = (await repo.claim({
      workspaceId,
      runId,
      workerId: "first",
    }))!;
    const reserved = await store.reserve(first, "action", {});
    if (reserved?.kind !== "reserved") throw new Error("Reservation failed");
    await client!.db
      .update(workflowRuns)
      .set({ leaseUntil: expression`now() - interval '1 second'` })
      .where(eq(workflowRuns.id, runId));
    const second = (await repo.claim({
      workspaceId,
      runId,
      workerId: "second",
    }))!;
    expect(
      await store.settle(first, reserved.execution.id, reserved.attemptId, {
        status: "succeeded",
        output: {},
      }),
    ).toBe(false);
    expect(
      await store.settle(second, reserved.execution.id, reserved.attemptId, {
        status: "succeeded",
        output: {},
      }),
    ).toBe(false);
    expect((await store.reserve(second, "action", {}))?.kind).toBe("existing");
  });
  it("refuses reservation at a node other than the durable cursor", async () => {
    const repo = graphRunLeases(client!.db);
    const lease = (await repo.claim({
      workspaceId,
      runId: await run(),
      workerId: "worker",
    }))!;
    expect(
      await graphNodeStore(client!.db).reserve(lease, "different_node", {}),
    ).toBeNull();
  });
  it.each(["succeeded", "failed"] as const)(
    "resumes %s results from DB and commits the terminal state",
    async (status) => {
      const repo = graphRunLeases(client!.db);
      const store = graphNodeStore(client!.db);
      const runId = await run();
      const lease = (await repo.claim({
        workspaceId,
        runId,
        workerId: "worker",
      }))!;
      expect(await graphRunStore(client!.db).advance(lease)).toMatchObject({
        type: "action",
        input: { body: "Hello" },
      });
      const reservation = await store.reserve(lease, "action", {
        body: "Hello",
      });
      if (reservation?.kind !== "reserved")
        throw new Error("Reservation failed");
      await store.settle(
        lease,
        reservation.execution.id,
        reservation.attemptId,
        status === "succeeded"
          ? { status, output: { noteId: "n1" } }
          : { status, code: "PROVIDER_FAILURE" },
      );
      // New repository objects reconstruct from DB, not process memory.
      expect(await graphRunStore(client!.db).advance(lease)).toMatchObject({
        type: "next",
        nodeId: "end",
      });
      const expected =
        status === "succeeded" ? "succeeded" : "completed_with_warnings";
      expect(await graphRunStore(client!.db).advance(lease)).toMatchObject({
        type: "finish",
        status: expected,
      });
      const [persisted] = await client!.db
        .select()
        .from(workflowRuns)
        .where(eq(workflowRuns.id, runId));
      expect(persisted!.logicalStatus).toBe(expected);
      expect(persisted!.leaseUntil).toBeNull();
      expect(persisted!.finishedAt).not.toBeNull();
      expect(await graphRunStore(client!.db).advance(lease)).toBeNull();
    },
  );
  it("runs v2 through injected provider adapter and persists terminal evidence", async () => {
    const runId = await run();
    const calls: string[] = [];
    const adapter: ActionAdapter = {
      async execute(request) {
        calls.push(request.effectKey);
        return { status: "succeeded", output: { noteId: "n-v2" } };
      },
    };
    const result = await runWorkflowV2(runId, {
      database: client!.db,
      workerId: "v2-success-worker",
      actionAdapter: adapter,
      heartbeatIntervalMs: 1_000,
    });
    expect(result.status).toBe("succeeded");
    expect(calls).toEqual([`workflow:${runId}:node:action`]);
    const executions = await client!.db
      .select()
      .from(workflowNodeExecutions)
      .where(eq(workflowNodeExecutions.runId, runId));
    expect(executions).toHaveLength(1);
    expect(executions[0]).toMatchObject({
      status: "succeeded",
      output: { noteId: "n-v2" },
      retryable: false,
    });
  });
  it("evaluates conditions against the injected workspace database and persists the chosen branch", async () => {
    const customGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        { id: "trigger", type: "trigger", event: "application.created" },
        {
          id: "condition",
          type: "condition",
          tree: [
            {
              type: "leaf",
              field: { kind: "candidate", path: "firstName" },
              op: "eq",
              value: "Package",
            },
          ],
        },
        { id: "true_end", type: "end", result: "completed" },
        { id: "false_end", type: "end", result: "stopped" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "condition" },
        { id: "e2", source: "condition", port: "true", target: "true_end" },
        { id: "e3", source: "condition", port: "false", target: "false_end" },
      ],
    };
    const runId = await runGraph(customGraph, {
      application: {
        id: fixtureApplicationId,
        candidateId: fixtureCandidateId,
        jobId: fixtureJobId,
      },
      candidateId: fixtureCandidateId,
      jobId: fixtureJobId,
    });

    const result = await runWorkflowV2(runId, {
      database: client!.db,
      workerId: "condition-workspace-db-worker",
    });

    expect(result.status).toBe("succeeded");
    const [execution] = await client!.db
      .select()
      .from(workflowNodeExecutions)
      .where(
        and(
          eq(workflowNodeExecutions.runId, runId),
          eq(workflowNodeExecutions.nodeId, "condition"),
        ),
      );
    expect(execution).toMatchObject({
      status: "succeeded",
      output: { matched: true },
      resolvedPort: "true",
    });
  });
  it("executes the low-score rejection, email, and durable-erasure branch end to end", async () => {
    const lowScoreGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        { id: "trigger", type: "trigger", event: "application.created" },
        {
          id: "score",
          type: "action",
          actionType: "ai_score",
          toolVersion: 1,
          failurePolicy: "stop",
          input: {},
        },
        {
          id: "under_threshold",
          type: "condition",
          tree: [
            {
              type: "leaf",
              field: { kind: "ai", path: "score" },
              op: "lt",
              value: 50,
            },
          ],
        },
        {
          id: "reject",
          type: "action",
          actionType: "set_status",
          toolVersion: 1,
          failurePolicy: "stop",
          input: { status: { kind: "literal", value: "rejected" } },
        },
        {
          id: "email",
          type: "action",
          actionType: "send_email",
          toolVersion: 1,
          failurePolicy: "stop",
          input: {
            subject: {
              kind: "literal",
              value: "Rechazo por puntaje",
            },
            body: {
              kind: "literal",
              value: "Hemos decidido no continuar con tu postulación.",
            },
          },
        },
        {
          id: "erase",
          type: "action",
          actionType: "erase_candidate_data",
          toolVersion: 1,
          failurePolicy: "stop",
          input: {},
        },
        { id: "rejected_end", type: "end", result: "stopped" },
        {
          id: "manual_review",
          type: "action",
          actionType: "add_tag",
          toolVersion: 1,
          failurePolicy: "stop",
          input: { label: { kind: "literal", value: "Revisar manualmente" } },
        },
        { id: "manual_end", type: "end", result: "completed" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "score" },
        { id: "e2", source: "score", port: "success", target: "under_threshold" },
        { id: "e3", source: "under_threshold", port: "true", target: "reject" },
        { id: "e4", source: "under_threshold", port: "false", target: "manual_review" },
        { id: "e5", source: "reject", port: "success", target: "email" },
        { id: "e6", source: "email", port: "success", target: "erase" },
        { id: "e7", source: "erase", port: "success", target: "rejected_end" },
        { id: "e8", source: "manual_review", port: "success", target: "manual_end" },
      ],
    };
    const runId = await runGraph(lowScoreGraph, {
      application: {
        id: fixtureApplicationId,
        candidateId: fixtureCandidateId,
        jobId: fixtureJobId,
      },
      candidate: { id: fixtureCandidateId },
      candidateId: fixtureCandidateId,
      jobId: fixtureJobId,
    });
    const actionCalls: string[] = [];
    const adapter: ActionAdapter = {
      async execute(request): Promise<NodeOutcome> {
        actionCalls.push(request.node.actionType);
        switch (request.node.actionType) {
          case "ai_score":
            await client!.db.insert(aiEvaluations).values({
              id: randomUUID(),
              workspaceId,
              candidateId: fixtureCandidateId,
              applicationId: fixtureApplicationId,
              jobId: fixtureJobId,
              provider: "test",
              modelId: "test-low-score",
              score: 42,
              recommendation: "no",
              summary: "Fixture low-score evaluation",
              generatedById: fixtureUserId,
            });
            return {
              status: "succeeded",
              output: {
                applicationId: fixtureApplicationId,
                score: 42,
                recommendation: "no",
                evaluationId: randomUUID(),
              },
            };
          case "set_status":
            return {
              status: "succeeded",
              output: { applicationId: fixtureApplicationId, status: "rejected" },
            };
          case "send_email":
            return {
              status: "succeeded",
              output: { outboxId: randomUUID(), queued: true },
            };
          case "erase_candidate_data":
            return {
              status: "succeeded",
              output: {
                candidateId: fixtureCandidateId,
                deletionJobId: randomUUID(),
                queued: true,
                status: "queued",
              },
            };
          case "add_tag":
            return {
              status: "succeeded",
              output: { candidateId: fixtureCandidateId, label: "Revisar manualmente" },
            };
          default:
            throw new Error(`Unexpected action: ${request.node.actionType}`);
        }
      },
    };

    const result = await runWorkflowV2(runId, {
      database: client!.db,
      workerId: "low-score-branch-worker",
      actionAdapter: adapter,
    });

    // A stopped end node is a terminal business outcome, distinct from a
    // failed worker execution.
    expect(result.status).toBe("stopped");
    expect(actionCalls).toEqual([
      "ai_score",
      "set_status",
      "send_email",
      "erase_candidate_data",
    ]);
    const executions = await client!.db
      .select({
        nodeId: workflowNodeExecutions.nodeId,
        status: workflowNodeExecutions.status,
        output: workflowNodeExecutions.output,
        resolvedPort: workflowNodeExecutions.resolvedPort,
      })
      .from(workflowNodeExecutions)
      .where(eq(workflowNodeExecutions.runId, runId));
    expect(executions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: "under_threshold", resolvedPort: "true", status: "succeeded" }),
        expect.objectContaining({ nodeId: "email", output: { outboxId: expect.any(String), queued: true } }),
        expect.objectContaining({ nodeId: "erase", output: expect.objectContaining({ queued: true, status: "queued" }) }),
      ]),
    );
    expect(executions.map((execution) => execution.nodeId)).not.toContain("manual_review");
  });
  it("keeps request_documents and its durable package in the worker database", async () => {
    const customGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        { id: "trigger", type: "trigger", event: "application.created" },
        {
          id: "request",
          type: "action",
          actionType: "request_documents",
          toolVersion: 1,
          failurePolicy: "stop",
          input: {
            applicationId: { kind: "literal", value: fixtureApplicationId },
            items: { kind: "literal", value: [{ title: "Identity document" }] },
          },
        },
        {
          id: "wait",
          type: "wait",
          kind: "document_package",
          resourceType: "package",
          resourceId: { kind: "output", nodeId: "request", path: "packageId" },
        },
        { id: "end", type: "end", result: "completed" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "request" },
        { id: "e2", source: "request", port: "success", target: "wait" },
        { id: "e3", source: "wait", port: "completed", target: "end" },
        { id: "e4", source: "wait", port: "declined", target: "end" },
        { id: "e5", source: "wait", port: "expired", target: "end" },
        { id: "e6", source: "wait", port: "cancelled", target: "end" },
      ],
    };
    const runId = await runGraph(customGraph, {
      application: {
        id: fixtureApplicationId,
        candidateId: fixtureCandidateId,
        jobId: fixtureJobId,
      },
      candidateId: fixtureCandidateId,
      jobId: fixtureJobId,
    });

    const result = await runWorkflowV2(runId, {
      database: client!.db,
      workerId: "document-package-worker",
    });

    expect(result.status).toBe("waiting");
    const [packageRow] = await client!.db
      .select({ id: documentRequestPackages.id })
      .from(documentRequestPackages)
      .where(
        and(
          eq(documentRequestPackages.workspaceId, workspaceId),
          eq(
            documentRequestPackages.workflowEffectId,
            `workflow:${runId}:node:request`,
          ),
        ),
      );
    expect(packageRow).toBeDefined();
    const [execution] = await client!.db
      .select()
      .from(workflowNodeExecutions)
      .where(
        and(
          eq(workflowNodeExecutions.runId, runId),
          eq(workflowNodeExecutions.nodeId, "wait"),
        ),
      );
    expect(execution).toMatchObject({
      status: "waiting",
      waitingKind: "document_package",
      waitingResourceType: "package",
    });
    expect(execution?.waitingResourceId).toBe(packageRow?.id);
  });
  it("executes a real registry action, passes its output downstream, and reuses it on retry", async () => {
    const customGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          event: "application.created",
          filter: {},
        },
        {
          id: "generate",
          type: "action",
          actionType: "generate_document",
          toolVersion: 1,
          failurePolicy: "stop",
          input: {
            title: { kind: "literal", value: "Employment agreement" },
            body: {
              kind: "literal",
              value: "Agreement for {{candidate_full_name}}.",
            },
          },
        },
        {
          id: "note",
          type: "action",
          actionType: "add_note",
          toolVersion: 1,
          failurePolicy: "stop",
          input: {
            body: { kind: "output", nodeId: "generate", path: "documentId" },
          },
        },
        { id: "end", type: "end", result: "completed" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "generate" },
        { id: "e2", source: "generate", port: "success", target: "note" },
        { id: "e3", source: "note", port: "success", target: "end" },
      ],
    };
    const runId = await runGraph(customGraph, {
      application: {
        id: fixtureApplicationId,
        candidateId: fixtureCandidateId,
        jobId: fixtureJobId,
      },
      candidateId: fixtureCandidateId,
      jobId: fixtureJobId,
    });

    const result = await runWorkflowV2(runId, {
      database: client!.db,
      workerId: "registry-action-worker",
    });
    expect(result.status).toBe("succeeded");

    const effectKey = `workflow:${runId}:node:generate`;
    const [generated] = await client!.db
      .select()
      .from(documents)
      .where(eq(documents.workflowEffectId, effectKey));
    expect(generated).toMatchObject({
      workspaceId,
      mimeType: "application/pdf",
      signatureStatus: "unsigned",
      workflowEffectId: effectKey,
    });
    const generatedBytes = await storage.read(generated!.storageKey);
    expect(generatedBytes.subarray(0, 5).toString()).toBe("%PDF-");

    const [note] = await client!.db
      .select()
      .from(candidateNotes)
      .where(
        eq(candidateNotes.workflowEffectId, `workflow:${runId}:node:note`),
      );
    expect(note).toMatchObject({
      candidateId: fixtureCandidateId,
      body: generated!.id,
    });

    const adapter = createRegistryActionAdapter(client!.db);
    const retried = await adapter.execute({
      workspaceId,
      runId,
      workflowId,
      actorUserId: fixtureUserId,
      triggerEvent: "application.created",
      triggerPayload: {
        application: {
          id: fixtureApplicationId,
          candidateId: fixtureCandidateId,
          jobId: fixtureJobId,
        },
        candidateId: fixtureCandidateId,
        jobId: fixtureJobId,
      },
      node: customGraph.nodes[1] as Extract<
        WorkflowGraphV2["nodes"][number],
        { type: "action" }
      >,
      input: {
        title: "Employment agreement",
        body: "Agreement for {{candidate_full_name}}.",
      },
      effectKey,
      signal: new AbortController().signal,
    });
    expect(retried).toMatchObject({
      status: "succeeded",
      output: { documentId: generated!.id, reused: true },
    });
    const generatedRows = await client!.db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.workflowEffectId, effectKey));
    expect(generatedRows).toHaveLength(1);
  });
  it("generates a workflow PDF with published PDF attachments appended", async () => {
    const sourcePdf = await PDFDocument.create();
    sourcePdf.addPage([612, 792]);
    sourcePdf.addPage([612, 792]);
    const sourceBytes = Buffer.from(await sourcePdf.save());
    const attachmentId = randomUUID();
    const attachmentName = "Company policy.pdf";
    const attachmentChecksum = createHash("sha256")
      .update(sourceBytes)
      .digest("hex");
    const attachmentStorageKey = `tests/${attachmentId}.pdf`;
    await storage.put(attachmentStorageKey, sourceBytes, "application/pdf");
    await client!.db.insert(documents).values({
      id: attachmentId,
      workspaceId,
      name: attachmentName,
      originalName: attachmentName,
      mimeType: "application/pdf",
      sizeBytes: sourceBytes.byteLength,
      checksum: attachmentChecksum,
      storageKey: attachmentStorageKey,
      status: "active",
      signatureStatus: "unsigned",
    });

    const customGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          event: "application.created",
          filter: {},
        },
        {
          id: "generate",
          type: "action",
          actionType: "generate_document",
          toolVersion: 1,
          failurePolicy: "stop",
          input: {
            title: { kind: "literal", value: "Employment agreement" },
            body: { kind: "literal", value: "Please review this agreement." },
            attachments: {
              kind: "literal",
              value: [
                {
                  documentId: attachmentId,
                  name: attachmentName,
                  checksum: attachmentChecksum,
                },
              ],
            },
          },
        },
        { id: "end", type: "end", result: "completed" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "generate" },
        { id: "e2", source: "generate", port: "success", target: "end" },
      ],
    };
    const runId = await runGraph(customGraph, {
      application: {
        id: fixtureApplicationId,
        candidateId: fixtureCandidateId,
        jobId: fixtureJobId,
      },
      candidateId: fixtureCandidateId,
      jobId: fixtureJobId,
    });

    expect(
      (
        await runWorkflowV2(runId, {
          database: client!.db,
          workerId: "document-attachment-worker",
        })
      ).status,
    ).toBe("succeeded");

    const [generated] = await client!.db
      .select()
      .from(documents)
      .where(eq(documents.workflowEffectId, `workflow:${runId}:node:generate`));
    expect(generated).toMatchObject({
      workspaceId,
      mimeType: "application/pdf",
      workflowEffectId: `workflow:${runId}:node:generate`,
    });
    const generatedPdf = await PDFDocument.load(
      await storage.read(generated!.storageKey),
    );
    // One generated content page, one labeled divider, and both immutable
    // pages copied from the source attachment.
    expect(generatedPdf.getPageCount()).toBe(4);
  });
  it("rejects a published attachment whose checksum changed before execution", async () => {
    const attachmentId = randomUUID();
    const attachmentName = "Updated company policy.pdf";
    const publishedChecksum = "a".repeat(64);
    await client!.db.insert(documents).values({
      id: attachmentId,
      workspaceId,
      name: attachmentName,
      originalName: attachmentName,
      mimeType: "application/pdf",
      sizeBytes: 1,
      checksum: "b".repeat(64),
      storageKey: `tests/${attachmentId}.pdf`,
      status: "active",
      signatureStatus: "unsigned",
    });

    const result = await createRegistryActionAdapter(client!.db).execute({
      workspaceId,
      runId: randomUUID(),
      workflowId,
      actorUserId: fixtureUserId,
      triggerEvent: "application.created",
      triggerPayload: {
        application: {
          id: fixtureApplicationId,
          candidateId: fixtureCandidateId,
          jobId: fixtureJobId,
        },
        candidateId: fixtureCandidateId,
        jobId: fixtureJobId,
      },
      node: {
        id: "generate",
        type: "action",
        actionType: "generate_document",
        toolVersion: 1,
        failurePolicy: "stop",
        input: {},
      },
      input: {
        title: "Employment agreement",
        body: "Please review this agreement.",
        attachments: [
          {
            documentId: attachmentId,
            name: attachmentName,
            checksum: publishedChecksum,
          },
        ],
      },
      effectKey: `workflow:${randomUUID()}:node:generate`,
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      status: "failed",
      code: "DOCUMENT_GENERATION_FAILED",
    });
  });
  it("does not resolve a PDF attachment from another workspace", async () => {
    const otherWorkspaceId = `lease-other-${randomUUID()}`;
    const attachmentId = randomUUID();
    const attachmentName = "Private company policy.pdf";
    const checksum = "c".repeat(64);
    await client!.db.insert(organization).values({
      id: otherWorkspaceId,
      name: "Other lease workspace",
      slug: otherWorkspaceId,
      createdAt: new Date(),
    });
    try {
      await client!.db.insert(documents).values({
        id: attachmentId,
        workspaceId: otherWorkspaceId,
        name: attachmentName,
        originalName: attachmentName,
        mimeType: "application/pdf",
        sizeBytes: 1,
        checksum,
        storageKey: `tests/${attachmentId}.pdf`,
        status: "active",
        signatureStatus: "unsigned",
      });

      const result = await createRegistryActionAdapter(client!.db).execute({
        workspaceId,
        runId: randomUUID(),
        workflowId,
        actorUserId: fixtureUserId,
        triggerEvent: "application.created",
        triggerPayload: {
          application: {
            id: fixtureApplicationId,
            candidateId: fixtureCandidateId,
            jobId: fixtureJobId,
          },
          candidateId: fixtureCandidateId,
          jobId: fixtureJobId,
        },
        node: {
          id: "generate",
          type: "action",
          actionType: "generate_document",
          toolVersion: 1,
          failurePolicy: "stop",
          input: {},
        },
        input: {
          title: "Employment agreement",
          body: "Please review this agreement.",
          attachments: [
            { documentId: attachmentId, name: attachmentName, checksum },
          ],
        },
        effectKey: `workflow:${randomUUID()}:node:generate`,
        signal: new AbortController().signal,
      });

      expect(result).toMatchObject({
        status: "failed",
        code: "DOCUMENT_GENERATION_FAILED",
      });
    } finally {
      await client!.db
        .delete(organization)
        .where(eq(organization.id, otherWorkspaceId));
    }
  });
  it("executes set_status through the durable application service and emits its domain event", async () => {
    await client!.db
      .update(applications)
      .set({ status: "active", updatedAt: new Date() })
      .where(
        and(
          eq(applications.workspaceId, workspaceId),
          eq(applications.id, fixtureApplicationId),
        ),
      );

    const customGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          event: "application.created",
          filter: {},
        },
        {
          id: "withdraw",
          type: "action",
          actionType: "set_status",
          toolVersion: 1,
          failurePolicy: "stop",
          input: { status: { kind: "literal", value: "withdrawn" } },
        },
        { id: "end", type: "end", result: "completed" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "withdraw" },
        { id: "e2", source: "withdraw", port: "success", target: "end" },
      ],
    };
    const runId = await runGraph(customGraph, {
      application: {
        id: fixtureApplicationId,
        candidateId: fixtureCandidateId,
        jobId: fixtureJobId,
      },
      candidateId: fixtureCandidateId,
      jobId: fixtureJobId,
    });

    expect(
      (
        await runWorkflowV2(runId, {
          database: client!.db,
          workerId: "status-action-worker",
        })
      ).status,
    ).toBe("succeeded");

    const [application] = await client!.db
      .select({ status: applications.status })
      .from(applications)
      .where(eq(applications.id, fixtureApplicationId));
    expect(application?.status).toBe("withdrawn");

    const [activity] = await client!.db
      .select({ type: activityEvents.type, metadata: activityEvents.metadata })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.workspaceId, workspaceId),
          eq(activityEvents.entityId, fixtureApplicationId),
        ),
      )
      .orderBy(desc(activityEvents.createdAt))
      .limit(1);
    expect(activity).toMatchObject({ type: "application.status_changed" });
    expect(activity?.metadata).toMatchObject({
      fromStatus: "active",
      toStatus: "withdrawn",
      source: "workflow",
    });

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
          eq(domainEventOutbox.eventName, "application.status_changed"),
        ),
      )
      .orderBy(desc(domainEventOutbox.createdAt))
      .limit(1);
    expect(event?.eventName).toBe("application.status_changed");
    expect(event?.automationParentRunId).toBe(runId);
    expect(event?.payload).toMatchObject({
      fromStatus: "active",
      toStatus: "withdrawn",
    });
  });
  it("replays a v2 run from a graph node without falling back to the linear engine", async () => {
    const customGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          event: "application.created",
          filter: {},
        },
        {
          id: "note",
          type: "action",
          actionType: "add_note",
          toolVersion: 1,
          failurePolicy: "stop",
          input: { body: { kind: "literal", value: "Replay me" } },
        },
        { id: "end", type: "end", result: "completed" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "note" },
        { id: "e2", source: "note", port: "success", target: "end" },
      ],
    };
    const sourceRunId = await runGraph(customGraph, {
      application: {
        id: fixtureApplicationId,
        candidateId: fixtureCandidateId,
        jobId: fixtureJobId,
      },
      candidateId: fixtureCandidateId,
      jobId: fixtureJobId,
    });
    expect(
      (
        await runWorkflowV2(sourceRunId, {
          database: client!.db,
          workerId: "replay-source-worker",
        })
      ).status,
    ).toBe("succeeded");

    const { replayRunFromStep } = await import("../data");
    const replay = await replayRunFromStep({
      database: client!.db,
      workspaceId,
      id: sourceRunId,
      stepIndex: 1,
    });
    expect(replay).toMatchObject({
      engineVersion: 2,
      versionId: expect.any(String),
      logicalStatus: "queued",
      cursorNodeId: "note",
      replayOfRunId: sourceRunId,
    });

    expect(
      (
        await runWorkflowV2(replay.id, {
          database: client!.db,
          workerId: "replay-v2-worker",
        })
      ).status,
    ).toBe("succeeded");
    const notes = await client!.db
      .select({ id: candidateNotes.id })
      .from(candidateNotes)
      .where(
        and(
          eq(candidateNotes.workspaceId, workspaceId),
          eq(candidateNotes.body, "Replay me"),
        ),
      );
    expect(notes.length).toBeGreaterThanOrEqual(2);
  });
  it("retries known provider failure with a new fenced attempt and no duplicate effect key", async () => {
    const runId = await run();
    let calls = 0;
    const adapter: ActionAdapter = {
      async execute() {
        calls += 1;
        return calls === 1
          ? { status: "failed", code: "TEMPORARY_PROVIDER", retryable: true }
          : { status: "succeeded", output: { noteId: "n-retried" } };
      },
    };
    expect(
      (
        await runWorkflowV2(runId, {
          database: client!.db,
          workerId: "retry-worker-1",
          actionAdapter: adapter,
        })
      ).status,
    ).toBe("retrying");
    await client!.db
      .update(workflowRuns)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(workflowRuns.id, runId));
    expect(
      (
        await runWorkflowV2(runId, {
          database: client!.db,
          workerId: "retry-worker-2",
          actionAdapter: adapter,
        })
      ).status,
    ).toBe("succeeded");
    expect(calls).toBe(2);
    const [execution] = await client!.db
      .select()
      .from(workflowNodeExecutions)
      .where(eq(workflowNodeExecutions.runId, runId));
    const attempts = await client!.db
      .select()
      .from(workflowNodeAttempts)
      .where(eq(workflowNodeAttempts.executionId, execution!.id));
    expect(
      attempts
        .sort((a, b) => a.attemptNo - b.attemptNo)
        .map((attempt) => attempt.status),
    ).toEqual(["failed", "succeeded"]);
    expect(new Set(attempts.map((attempt) => attempt.fenceToken)).size).toBe(2);
  });
  it("does not automatically retry an adapter exception with an unknown effect", async () => {
    const runId = await run();
    let calls = 0;
    const result = await runWorkflowV2(runId, {
      database: client!.db,
      workerId: "throwing-adapter-worker",
      actionAdapter: {
        async execute() {
          calls += 1;
          throw new Error("provider response was lost after acceptance");
        },
      },
    });

    expect(result).toMatchObject({
      status: "uncertain",
      code: "ACTION_ADAPTER_THROW",
    });
    expect(calls).toBe(1);
    const [execution] = await client!.db
      .select()
      .from(workflowNodeExecutions)
      .where(eq(workflowNodeExecutions.runId, runId));
    expect(execution).toMatchObject({
      status: "uncertain",
      errorCode: "ACTION_ADAPTER_THROW",
      retryable: false,
    });
    const attempts = await client!.db
      .select()
      .from(workflowNodeAttempts)
      .where(eq(workflowNodeAttempts.executionId, execution!.id));
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      status: "uncertain",
      errorCode: "ACTION_ADAPTER_THROW",
    });
  });
  it("keeps action retries available after wait-resolver lease claims", async () => {
    const runId = await run();
    const leases = graphRunLeases(client!.db);

    // Resolver workers claim the run before handing it back to the queue. Those
    // claims must not consume the retry budget of the later action node.
    for (const workerId of ["approval-resolver", "resume-worker"]) {
      const lease = await leases.claim({ workspaceId, runId, workerId });
      expect(lease).not.toBeNull();
      expect(await leases.release(lease!, "queued")).toBe(true);
    }

    const result = await runWorkflowV2(runId, {
      database: client!.db,
      workerId: "action-worker-after-wait",
      actionAdapter: {
        execute: async () => ({
          status: "failed",
          code: "TEMPORARY_PROVIDER",
          retryable: true,
        }),
      },
    });
    expect(result.status).toBe("retrying");
  });
  it("marks an in-flight effect uncertain after worker takeover instead of replaying it", async () => {
    const runId = await run();
    const first = (await graphRunLeases(client!.db).claim({
      workspaceId,
      runId,
      workerId: "crashed-worker",
    }))!;
    const reserved = await graphNodeStore(client!.db).reserve(first, "action", {
      body: "Hello",
    });
    if (reserved?.kind !== "reserved") throw new Error("Reservation failed");
    await client!.db
      .update(workflowRuns)
      .set({ leaseUntil: expression`now() - interval '1 second'` })
      .where(eq(workflowRuns.id, runId));
    const result = await runWorkflowV2(runId, {
      database: client!.db,
      workerId: "recovery-worker",
      actionAdapter: {
        execute: async () => ({ status: "succeeded", output: {} }),
      },
    });
    expect(result.status).toBe("uncertain");
    const [execution] = await client!.db
      .select()
      .from(workflowNodeExecutions)
      .where(eq(workflowNodeExecutions.runId, runId));
    expect(execution?.status).toBe("uncertain");
  });
  it("reconciles an uncertain effect without invoking the provider again", async () => {
    const runId = await run();
    const first = (await graphRunLeases(client!.db).claim({
      workspaceId,
      runId,
      workerId: "reconcile-crashed-worker",
    }))!;
    const reserved = await graphNodeStore(client!.db).reserve(first, "action", {
      body: "Hello",
    });
    if (reserved?.kind !== "reserved") throw new Error("Reservation failed");
    await client!.db
      .update(workflowRuns)
      .set({ leaseUntil: expression`now() - interval '1 second'` })
      .where(eq(workflowRuns.id, runId));
    expect(
      (
        await runWorkflowV2(runId, {
          database: client!.db,
          workerId: "reconcile-recovery-worker",
        })
      ).status,
    ).toBe("uncertain");

    const result = await resolveWorkflowUncertain(
      {
        workspaceId,
        runId,
        nodeId: "action",
        decision: "succeeded",
        note: "Verified the provider record before resuming.",
        providerRef: "provider-message-123",
        output: { noteId: "verified-note" },
      },
      client!.db,
    );
    expect(result).toMatchObject({ ok: true, resumedStatus: "succeeded" });

    const [execution] = await client!.db
      .select()
      .from(workflowNodeExecutions)
      .where(eq(workflowNodeExecutions.runId, runId));
    expect(execution).toMatchObject({
      status: "succeeded",
      output: { noteId: "verified-note" },
      resolvedPort: "success",
    });
    const attempts = await client!.db
      .select()
      .from(workflowNodeAttempts)
      .where(eq(workflowNodeAttempts.executionId, execution!.id));
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      status: "succeeded",
      providerRef: "provider-message-123",
    });
  });
  it("parks a delay durably and resumes it after its deadline", async () => {
    const customGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          event: "application.created",
          filter: {},
        },
        { id: "delay", type: "delay", mode: "duration", durationMs: 60_000 },
        { id: "end", type: "end", result: "completed" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "delay" },
        { id: "e2", source: "delay", port: "elapsed", target: "end" },
      ],
    };
    const runId = await runGraph(customGraph);
    expect(
      (
        await runWorkflowV2(runId, {
          database: client!.db,
          workerId: "delay-worker",
        })
      ).status,
    ).toBe("waiting");
    const [waiting] = await client!.db
      .select()
      .from(workflowNodeExecutions)
      .where(eq(workflowNodeExecutions.runId, runId));
    expect(waiting).toMatchObject({ status: "waiting", waitingKind: "delay" });
    await client!.db
      .update(workflowRuns)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(workflowRuns.id, runId));
    await client!.db
      .update(workflowNodeExecutions)
      .set({ deadlineAt: new Date(0) })
      .where(eq(workflowNodeExecutions.id, waiting!.id));
    expect(
      (
        await runWorkflowV2(runId, {
          database: client!.db,
          workerId: "delay-resumer",
        })
      ).status,
    ).toBe("succeeded");
  });
  it("persists a transition-limit failure and releases the lease", async () => {
    const customGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          event: "application.created",
          filter: {},
        },
        { id: "end", type: "end", result: "completed" },
      ],
      edges: [{ id: "e1", source: "trigger", port: "next", target: "end" }],
    };
    const runId = await runGraph(customGraph);
    expect(
      (await runWorkflowV2(runId, { database: client!.db, maxTransitions: 1 }))
        .status,
    ).toBe("failed");
    const [persisted] = await client!.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId));
    expect(persisted).toMatchObject({
      logicalStatus: "failed",
      status: "failed",
      error: "TRANSITION_LIMIT_EXCEEDED",
      lockedBy: null,
      leaseUntil: null,
    });
  });
  it("resolves an approval through the authenticated workspace member", async () => {
    const customGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          event: "application.created",
          filter: {},
        },
        {
          id: "approval",
          type: "approval",
          eligibleActorIds: [fixtureUserId],
          rule: "any",
          deadlineHours: 48,
        },
        { id: "approved", type: "end", result: "completed" },
        { id: "rejected", type: "end", result: "stopped" },
        { id: "expired", type: "end", result: "stopped" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "approval" },
        { id: "e2", source: "approval", port: "approved", target: "approved" },
        { id: "e3", source: "approval", port: "rejected", target: "rejected" },
        { id: "e4", source: "approval", port: "expired", target: "expired" },
      ],
    };
    const runId = await runGraph(customGraph);
    expect(
      (
        await runWorkflowV2(runId, {
          database: client!.db,
          workerId: "approval-worker",
        })
      ).status,
    ).toBe("waiting");
    expect(
      await resolveWorkflowApproval(
        {
          workspaceId,
          actorId: fixtureUserId,
          decision: "approved",
          runId,
          nodeId: "approval",
        },
        client!.db,
      ),
    ).toBe(1);
    const [persisted] = await client!.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId));
    expect(persisted?.logicalStatus).toBe("succeeded");
  });
  it("expires a due approval after restart and follows its expired branch", async () => {
    const customGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          event: "application.created",
          filter: {},
        },
        {
          id: "approval",
          type: "approval",
          eligibleActorIds: [fixtureUserId],
          rule: "any",
          deadlineHours: 48,
        },
        { id: "approved", type: "end", result: "completed" },
        { id: "rejected", type: "end", result: "stopped" },
        { id: "expired", type: "end", result: "stopped" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "approval" },
        { id: "e2", source: "approval", port: "approved", target: "approved" },
        { id: "e3", source: "approval", port: "rejected", target: "rejected" },
        { id: "e4", source: "approval", port: "expired", target: "expired" },
      ],
    };
    const runId = await runGraph(customGraph);
    expect(
      (
        await runWorkflowV2(runId, {
          database: client!.db,
          workerId: "approval-expiry-worker",
        })
      ).status,
    ).toBe("waiting");
    const [waiting] = await client!.db
      .select()
      .from(workflowNodeExecutions)
      .where(eq(workflowNodeExecutions.runId, runId));
    await client!.db
      .update(workflowRuns)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(workflowRuns.id, runId));
    await client!.db
      .update(workflowNodeExecutions)
      .set({ deadlineAt: new Date(0) })
      .where(eq(workflowNodeExecutions.id, waiting!.id));

    // The deadline is persisted independently of the worker process. A fresh
    // worker must claim the waiting run and take the explicit expired port.
    expect(
      (
        await runWorkflowV2(runId, {
          database: client!.db,
          workerId: "approval-expiry-resumer",
        })
      ).status,
    ).toBe("stopped");
    const [persisted] = await client!.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId));
    expect(persisted?.logicalStatus).toBe("stopped");
    const executions = await client!.db
      .select()
      .from(workflowNodeExecutions)
      .where(eq(workflowNodeExecutions.runId, runId));
    expect(
      executions.find((execution) => execution.nodeId === "approval")
        ?.resolvedPort,
    ).toBe("expired");
  });
  it("rejects a late approval before the scheduler resolves the deadline", async () => {
    const customGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          event: "application.created",
          filter: {},
        },
        {
          id: "approval",
          type: "approval",
          eligibleActorIds: [fixtureUserId],
          rule: "any",
          deadlineHours: 48,
        },
        { id: "approved", type: "end", result: "completed" },
        { id: "rejected", type: "end", result: "stopped" },
        { id: "expired", type: "end", result: "stopped" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "approval" },
        { id: "e2", source: "approval", port: "approved", target: "approved" },
        { id: "e3", source: "approval", port: "rejected", target: "rejected" },
        { id: "e4", source: "approval", port: "expired", target: "expired" },
      ],
    };
    const runId = await runGraph(customGraph);
    expect(
      (
        await runWorkflowV2(runId, {
          database: client!.db,
          workerId: "late-approval-worker",
        })
      ).status,
    ).toBe("waiting");
    const [waiting] = await client!.db
      .select()
      .from(workflowNodeExecutions)
      .where(eq(workflowNodeExecutions.runId, runId));
    await client!.db
      .update(workflowNodeExecutions)
      .set({ deadlineAt: new Date(0) })
      .where(eq(workflowNodeExecutions.id, waiting!.id));

    // The run remains waiting because the scheduler has not reconciled it yet.
    // The resolver must still enforce the database-backed deadline and avoid
    // recording a vote that could be consumed after expiry.
    expect(
      await resolveWorkflowApproval(
        {
          workspaceId,
          actorId: fixtureUserId,
          decision: "approved",
          runId,
          nodeId: "approval",
        },
        client!.db,
      ),
    ).toBe(0);
    const votes = await client!.db
      .select()
      .from(workflowApprovalVotes)
      .where(eq(workflowApprovalVotes.executionId, waiting!.id));
    expect(votes).toHaveLength(0);
    const [persisted] = await client!.db
      .select()
      .from(workflowNodeExecutions)
      .where(eq(workflowNodeExecutions.id, waiting!.id));
    expect(persisted?.status).toBe("waiting");
  });
  it("starts a fresh approval round when assignees are reassigned", async () => {
    const customGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          event: "application.created",
          filter: {},
        },
        {
          id: "approval",
          type: "approval",
          eligibleActorIds: [fixtureUserId],
          rule: "any",
          deadlineHours: 48,
        },
        { id: "approved", type: "end", result: "completed" },
        { id: "rejected", type: "end", result: "stopped" },
        { id: "expired", type: "end", result: "stopped" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "approval" },
        { id: "e2", source: "approval", port: "approved", target: "approved" },
        { id: "e3", source: "approval", port: "rejected", target: "rejected" },
        { id: "e4", source: "approval", port: "expired", target: "expired" },
      ],
    };
    const runId = await runGraph(customGraph);
    expect(
      (
        await runWorkflowV2(runId, {
          database: client!.db,
          workerId: "approval-reassign-worker",
        })
      ).status,
    ).toBe("waiting");
    const [waiting] = await client!.db
      .select()
      .from(workflowNodeExecutions)
      .where(eq(workflowNodeExecutions.runId, runId));
    expect(waiting).toBeDefined();
    await client!.db.insert(workflowApprovalVotes).values({
      workspaceId,
      executionId: waiting!.id,
      actorId: fixtureUserId,
      decision: "approved",
    });

    const result = await reassignWorkflowApproval(
      {
        workspaceId,
        actorId: fixtureUserId,
        runId,
        nodeId: "approval",
        actorIds: [fixtureSecondUserId],
      },
      client!.db,
    );
    expect(result).toMatchObject({ ok: true, actorIds: [fixtureSecondUserId] });

    const votes = await client!.db
      .select()
      .from(workflowApprovalVotes)
      .where(eq(workflowApprovalVotes.executionId, waiting!.id));
    expect(votes).toHaveLength(0);
    expect(
      await resolveWorkflowApproval(
        {
          workspaceId,
          actorId: fixtureUserId,
          decision: "approved",
          runId,
          nodeId: "approval",
        },
        client!.db,
      ),
    ).toBe(0);
    expect(
      await resolveWorkflowApproval(
        {
          workspaceId,
          actorId: fixtureSecondUserId,
          decision: "approved",
          runId,
          nodeId: "approval",
        },
        client!.db,
      ),
    ).toBe(1);
  });
  it("resumes an event wait only through the event resolver", async () => {
    const customGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          event: "application.created",
          filter: {},
        },
        {
          id: "wait",
          type: "wait",
          kind: "event",
          eventName: "application.stage_changed",
        },
        { id: "end", type: "end", result: "completed" },
        { id: "expired", type: "end", result: "stopped" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "wait" },
        { id: "e2", source: "wait", port: "matched", target: "end" },
        { id: "e3", source: "wait", port: "expired", target: "expired" },
      ],
    };
    const runId = await runGraph(customGraph);
    const scopedRunId = await runGraph({
      ...customGraph,
      nodes: customGraph.nodes.map((node) =>
        node.id === "wait" && node.type === "wait"
          ? { ...node, resourceId: { kind: "literal" as const, value: "a1" } }
          : node,
      ),
    });
    expect(
      (
        await runWorkflowV2(runId, {
          database: client!.db,
          workerId: "event-worker",
        })
      ).status,
    ).toBe("waiting");
    const [registeredWait] = await client!.db
      .select({ waitingEventCursor: workflowNodeExecutions.waitingEventCursor })
      .from(workflowNodeExecutions)
      .where(
        and(
          eq(workflowNodeExecutions.runId, runId),
          eq(workflowNodeExecutions.nodeId, "wait"),
        ),
      );
    expect(registeredWait?.waitingEventCursor).toEqual(expect.any(Number));
    expect(
      (
        await runWorkflowV2(scopedRunId, {
          database: client!.db,
          workerId: "scoped-event-worker",
        })
      ).status,
    ).toBe("waiting");
    // A resource-scoped waiter must not resume for a different application;
    // the unscoped waiter still receives the event.
    expect(
      await resumeWorkflowEventWaits(
        {
          workspaceId,
          eventName: "application.stage_changed",
          payload: { applicationId: "other-application" },
        },
        client!.db,
      ),
    ).toBe(1);
    const [persisted] = await client!.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId));
    expect(persisted?.logicalStatus).toBe("succeeded");
    const [scopedWaiting] = await client!.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, scopedRunId));
    expect(scopedWaiting?.logicalStatus).toBe("waiting");
    expect(
      await resumeWorkflowEventWaits(
        {
          workspaceId,
          eventName: "application.stage_changed",
          payload: { applicationId: "a1" },
        },
        client!.db,
      ),
    ).toBe(1);
    const [scopedPersisted] = await client!.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, scopedRunId));
    expect(scopedPersisted?.logicalStatus).toBe("succeeded");

    const lateCallbackRunId = await runGraph(customGraph);
    expect(
      (
        await runWorkflowV2(lateCallbackRunId, {
          database: client!.db,
          workerId: "late-callback-worker",
        })
      ).status,
    ).toBe("waiting");
    await client!.db
      .update(workflowNodeExecutions)
      .set({
        deadlineAt: expression`now() - interval '1 second'`,
      })
      .where(
        and(
          eq(workflowNodeExecutions.runId, lateCallbackRunId),
          eq(workflowNodeExecutions.nodeId, "wait"),
        ),
      );
    expect(
      await resumeWorkflowEventWaits(
        { workspaceId, eventName: "application.stage_changed", payload: {} },
        client!.db,
      ),
    ).toBe(1);
    const [lateExecution] = await client!.db
      .select()
      .from(workflowNodeExecutions)
      .where(
        and(
          eq(workflowNodeExecutions.runId, lateCallbackRunId),
          eq(workflowNodeExecutions.nodeId, "wait"),
        ),
      );
    expect(lateExecution?.resolvedPort).toBe("expired");
    const [lateRun] = await client!.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, lateCallbackRunId));
    expect(lateRun?.logicalStatus).toBe("stopped");
  });
  it("filters older events and recovers a missed scoped outbox dispatch", async () => {
    const customGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          event: "application.created",
          filter: {},
        },
        {
          id: "wait",
          type: "wait",
          kind: "event",
          eventName: "application.stage_changed",
          resourceId: {
            kind: "literal",
            value: "target-application",
          },
          deadlineHours: 24,
        },
        { id: "completed", type: "end", result: "completed" },
        { id: "expired", type: "end", result: "stopped" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "wait" },
        { id: "e2", source: "wait", port: "matched", target: "completed" },
        { id: "e3", source: "wait", port: "expired", target: "expired" },
      ],
    };
    const [alreadyOccurred] = await client!.db
      .insert(domainEventOutbox)
      .values({
        workspaceId,
        eventName: "application.stage_changed",
        eventVersion: 1,
        schemaVersion: 1,
        payload: { applicationId: "target-application" },
        automationsDispatchedAt: new Date(),
      })
      .returning({ id: domainEventOutbox.id });
    const runId = await runGraph(customGraph);
    expect(
      (
        await runWorkflowV2(runId, {
          database: client!.db,
          workerId: "event-cursor-worker",
        })
      ).status,
    ).toBe("waiting");

    const [waiting] = await client!.db
      .select({
        id: workflowNodeExecutions.id,
        eventCursor: workflowNodeExecutions.waitingEventCursor,
      })
      .from(workflowNodeExecutions)
      .where(
        and(
          eq(workflowNodeExecutions.runId, runId),
          eq(workflowNodeExecutions.nodeId, "wait"),
        ),
      );
    expect(waiting?.eventCursor).toBeGreaterThanOrEqual(alreadyOccurred!.id);
    expect(
      await resumeWorkflowEventWaits(
        {
          workspaceId,
          eventName: "application.stage_changed",
          payload: { applicationId: "target-application" },
          eventSequence: alreadyOccurred!.id,
        },
        client!.db,
      ),
    ).toBe(0);

    await client!.db.insert(domainEventOutbox).values({
      workspaceId,
      eventName: "application.stage_changed",
      eventVersion: 1,
      schemaVersion: 1,
      payload: { applicationId: "another-application" },
      automationsDispatchedAt: new Date(),
    });
    expect(
      await reconcileMissedWorkflowEventWaits(client!.db, {
        workspaceId,
        runId,
      }),
    ).toBe(0);

    const [missedDispatch] = await client!.db
      .insert(domainEventOutbox)
      .values({
        workspaceId,
        eventName: "application.stage_changed",
        eventVersion: 1,
        schemaVersion: 1,
        payload: { applicationId: "target-application" },
        automationsDispatchedAt: new Date(),
      })
      .returning({ id: domainEventOutbox.id });
    expect(missedDispatch!.id).toBeGreaterThan(waiting!.eventCursor!);
    expect(
      await reconcileMissedWorkflowEventWaits(client!.db, {
        workspaceId,
        runId,
      }),
    ).toBe(1);

    const [persistedRun] = await client!.db
      .select({ logicalStatus: workflowRuns.logicalStatus })
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId));
    const [persistedWait] = await client!.db
      .select({
        status: workflowNodeExecutions.status,
        resolvedPort: workflowNodeExecutions.resolvedPort,
        waitingEventCursor: workflowNodeExecutions.waitingEventCursor,
      })
      .from(workflowNodeExecutions)
      .where(eq(workflowNodeExecutions.id, waiting!.id));
    expect(persistedRun?.logicalStatus).toBe("succeeded");
    expect(persistedWait).toMatchObject({
      status: "succeeded",
      resolvedPort: "matched",
      waitingEventCursor: null,
    });
    expect(
      await reconcileMissedWorkflowEventWaits(client!.db, {
        workspaceId,
        runId,
      }),
    ).toBe(0);
  });

  it("resumes a document package wait from committed signature state", async () => {
    const documentId = randomUUID();
    await client!.db.insert(documents).values({
      id: documentId,
      workspaceId,
      name: "Employment agreement.pdf",
      originalName: "Employment agreement.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      checksum: "test-checksum",
      storageKey: `tests/${documentId}.pdf`,
      signatureStatus: "unsigned",
    });
    const customGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          event: "application.created",
          filter: {},
        },
        {
          id: "wait",
          type: "wait",
          kind: "document_package",
          resourceType: "document",
          resourceId: { kind: "literal", value: documentId },
        },
        { id: "completed", type: "end", result: "completed" },
        { id: "declined", type: "end", result: "stopped" },
        { id: "expired", type: "end", result: "stopped" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "wait" },
        { id: "e2", source: "wait", port: "completed", target: "completed" },
        { id: "e3", source: "wait", port: "declined", target: "declined" },
        { id: "e4", source: "wait", port: "cancelled", target: "expired" },
        { id: "e5", source: "wait", port: "expired", target: "expired" },
      ],
    };
    const runId = await runGraph(customGraph);
    expect((await runWorkflowV2(runId, { database: client!.db })).status).toBe(
      "waiting",
    );
    await client!.db
      .update(documents)
      .set({ signatureStatus: "signed" })
      .where(eq(documents.id, documentId));
    // The scheduler must also discover this terminal document state if the
    // finalize callback committed successfully but the wake-up was lost.
    expect(await findDueWorkflowRuns(client!.db)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: runId, engineVersion: 2 }),
      ]),
    );
    // Simulate a process dying after the provider/domain commit but before the
    // callback. The normal worker claim must discover the signed document and
    // wake the run from persisted state.
    expect(
      (
        await runWorkflowV2(runId, {
          database: client!.db,
          workerId: "signature-recovery-worker",
        })
      ).status,
    ).toBe("succeeded");
    const [persisted] = await client!.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId));
    expect(persisted?.logicalStatus).toBe("succeeded");
    const executions = await client!.db
      .select()
      .from(workflowNodeExecutions)
      .where(eq(workflowNodeExecutions.runId, runId));
    expect(
      executions.find((execution) => execution.nodeId === "wait")?.resolvedPort,
    ).toBe("completed");
  });
  it("expires native signature documents and resumes their expired branch", async () => {
    const documentId = randomUUID();
    const envelopeId = randomUUID();
    await client!.db.insert(signatureEnvelopes).values({
      id: envelopeId,
      workspaceId,
      provider: "native",
      providerEnvelopeId: `native-${envelopeId}`,
      kind: "document",
      status: "sent",
    });
    await client!.db.insert(signatureRecipients).values({
      workspaceId,
      envelopeId,
      providerRecipientId: `recipient-${envelopeId}`,
      email: "candidate@example.test",
      name: "Candidate",
      status: "sent",
    });
    await client!.db.insert(documents).values({
      id: documentId,
      workspaceId,
      name: "Expiring employment agreement.pdf",
      originalName: "Expiring employment agreement.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      checksum: `expiry-${documentId}`,
      storageKey: `tests/${documentId}.pdf`,
      signatureStatus: "pending",
      signatureProvider: "native",
      signatureEnvelopeRefId: envelopeId,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const customGraph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        {
          id: "trigger",
          type: "trigger",
          event: "application.created",
          filter: {},
        },
        {
          id: "wait",
          type: "wait",
          kind: "document_package",
          resourceType: "document",
          resourceId: { kind: "literal", value: documentId },
        },
        { id: "completed", type: "end", result: "completed" },
        { id: "expired", type: "end", result: "stopped" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "wait" },
        { id: "e2", source: "wait", port: "completed", target: "completed" },
        { id: "e3", source: "wait", port: "declined", target: "expired" },
        { id: "e4", source: "wait", port: "cancelled", target: "expired" },
        { id: "e5", source: "wait", port: "expired", target: "expired" },
      ],
    };
    const runId = await runGraph(customGraph);
    expect((await runWorkflowV2(runId, { database: client!.db })).status).toBe(
      "waiting",
    );

    const expired = await expireOverdueDocuments(client!.db);
    expect(expired).toMatchObject({
      expired: 1,
      documents: [{ workspaceId, documentId }],
    });
    const [persistedDocument] = await client!.db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId));
    const [persistedEnvelope] = await client!.db
      .select()
      .from(signatureEnvelopes)
      .where(eq(signatureEnvelopes.id, envelopeId));
    const [persistedRecipient] = await client!.db
      .select()
      .from(signatureRecipients)
      .where(eq(signatureRecipients.envelopeId, envelopeId));
    const [expiryEvent] = await client!.db
      .select()
      .from(signatureEvents)
      .where(eq(signatureEvents.eventKey, `native:${envelopeId}:expired`));
    expect(persistedDocument?.signatureStatus).toBe("expired");
    expect(persistedEnvelope?.status).toBe("voided");
    expect(persistedRecipient?.status).toBe("expired");
    expect(expiryEvent?.eventType).toBe("envelope_expired");
    // The native expiry transaction may commit before its wake callback runs.
    // The normal scheduler/worker path must still claim and resume the run.
    expect(await findDueWorkflowRuns(client!.db)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: runId, engineVersion: 2 }),
      ]),
    );
    expect(
      (
        await runWorkflowV2(runId, {
          database: client!.db,
          workerId: "signature-expiry-recovery-worker",
        })
      ).status,
    ).toBe("stopped");
    const [persistedRun] = await client!.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId));
    expect(persistedRun?.logicalStatus).toBe("stopped");
  });
});
