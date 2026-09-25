import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import {
  createDatabaseClient,
  documents,
  signatureEnvelopes,
  signatureEvents,
  signatureRecipients,
  workflowDefinitions,
  workflowDefinitionVersions,
  workflowNodeExecutions,
  workflowRuns,
} from "@harly/db";

import { semanticGraphHash } from "../src/features/automations/definition/hash";
import type { WorkflowGraphV2 } from "../src/features/automations/definition/schema-v2";
import {
  E2E_BASE_URL,
  E2E_CRON_SECRET,
  E2E_DATABASE_URL,
  FIXTURE,
} from "./constants";

test("document expiry is recovered by cron and a later v2 scheduler tick", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { db, sql } = createDatabaseClient(E2E_DATABASE_URL);
  const workflowId = randomUUID();
  const versionId = randomUUID();
  const runId = randomUUID();
  const documentId = randomUUID();
  const envelopeId = randomUUID();
  const triggerPayload = {
    application: {
      id: "e2e-expiry-application",
      candidateId: "e2e-expiry-candidate",
      jobId: "e2e-expiry-job",
    },
  };
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

  try {
    await db.insert(workflowDefinitions).values({
      id: workflowId,
      workspaceId: FIXTURE.workspaceId,
      name: `Expiry recovery ${runId}`,
      triggerEvent: "application.created",
      trigger: { event: "application.created", filter: {} },
      conditions: [],
      actions: [],
      enabled: true,
      status: "published",
      engineVersion: 2,
      createdById: FIXTURE.recruiterId,
    });
    await db.insert(workflowDefinitionVersions).values({
      id: versionId,
      workflowId,
      workspaceId: FIXTURE.workspaceId,
      name: `Expiry recovery ${runId}`,
      version: 1,
      schemaVersion: 2,
      graph,
      contentHash: semanticGraphHash(graph),
      publishedAt: new Date(),
      createdById: FIXTURE.recruiterId,
      triggerEvent: "application.created",
      trigger: { event: "application.created", filter: {} },
      conditions: [],
      actions: [],
    });
    await db
      .update(workflowDefinitions)
      .set({ publishedVersionId: versionId })
      .where(eq(workflowDefinitions.id, workflowId));
    await db.insert(signatureEnvelopes).values({
      id: envelopeId,
      workspaceId: FIXTURE.workspaceId,
      provider: "native",
      providerEnvelopeId: `e2e-native-${envelopeId}`,
      kind: "document",
      status: "sent",
    });
    await db.insert(signatureRecipients).values({
      workspaceId: FIXTURE.workspaceId,
      envelopeId,
      providerRecipientId: `e2e-recipient-${envelopeId}`,
      email: "expiry-candidate@harly-e2e.test",
      name: "Expiry Candidate",
      status: "sent",
    });
    await db.insert(documents).values({
      id: documentId,
      workspaceId: FIXTURE.workspaceId,
      name: `Expiring agreement ${runId}.pdf`,
      originalName: `Expiring agreement ${runId}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 1,
      checksum: `e2e-expiry-${documentId}`,
      storageKey: `e2e/${documentId}.pdf`,
      signatureStatus: "pending",
      signatureProvider: "native",
      signatureEnvelopeRefId: envelopeId,
      expiresAt: new Date(Date.now() - 60_000),
      ownerId: FIXTURE.recruiterId,
      createdById: FIXTURE.recruiterId,
    });
    await db.insert(workflowRuns).values({
      id: runId,
      workspaceId: FIXTURE.workspaceId,
      workflowId,
      triggerEvent: "application.created",
      triggerPayload,
      engineVersion: 2,
      versionId,
      logicalStatus: "queued",
      cursorNodeId: graph.entryNodeId,
      contextSnapshot: triggerPayload,
    });

    const authorization = {
      Authorization: `Bearer ${E2E_CRON_SECRET}`,
    };
    const initialSchedulerTick = await page.request.post(
      `${E2E_BASE_URL}/api/cron/automations`,
      { headers: authorization },
    );
    expect(initialSchedulerTick.ok()).toBe(true);
    await expect
      .poll(async () => {
        const [run] = await db
          .select({ status: workflowRuns.logicalStatus })
          .from(workflowRuns)
          .where(eq(workflowRuns.id, runId));
        return run?.status;
      })
      .toBe("waiting");

    const expiryTick = await page.request.post(
      `${E2E_BASE_URL}/api/cron/document-expiry`,
      { headers: authorization },
    );
    expect(expiryTick.ok()).toBe(true);
    expect(await expiryTick.json()).toMatchObject({
      ok: true,
      documentsExpired: 1,
      workflowsResumed: 1,
    });
    const [expiredDocument] = await db
      .select({ status: documents.signatureStatus })
      .from(documents)
      .where(eq(documents.id, documentId));
    const [voidedEnvelope] = await db
      .select({ status: signatureEnvelopes.status })
      .from(signatureEnvelopes)
      .where(eq(signatureEnvelopes.id, envelopeId));
    const [expiredRecipient] = await db
      .select({ status: signatureRecipients.status })
      .from(signatureRecipients)
      .where(eq(signatureRecipients.envelopeId, envelopeId));
    const [expiryEvent] = await db
      .select({ eventType: signatureEvents.eventType })
      .from(signatureEvents)
      .where(eq(signatureEvents.eventKey, `native:${envelopeId}:expired`));
    expect(expiredDocument?.status).toBe("expired");
    expect(voidedEnvelope?.status).toBe("voided");
    expect(expiredRecipient?.status).toBe("expired");
    expect(expiryEvent?.eventType).toBe("envelope_expired");

    // A separate HTTP request/worker tick must resume only from the committed
    // expired state; the expiry request itself does not execute the graph.
    const recoveryTick = await page.request.post(
      `${E2E_BASE_URL}/api/cron/automations`,
      { headers: authorization },
    );
    expect(recoveryTick.ok()).toBe(true);
    await expect
      .poll(async () => {
        const [run] = await db
          .select({ status: workflowRuns.logicalStatus })
          .from(workflowRuns)
          .where(eq(workflowRuns.id, runId));
        return run?.status;
      })
      .toBe("stopped");
    const [waitExecution] = await db
      .select({
        status: workflowNodeExecutions.status,
        resolvedPort: workflowNodeExecutions.resolvedPort,
      })
      .from(workflowNodeExecutions)
      .where(
        and(
          eq(workflowNodeExecutions.runId, runId),
          eq(workflowNodeExecutions.nodeId, "wait"),
        ),
      );
    expect(waitExecution).toMatchObject({
      status: "succeeded",
      resolvedPort: "expired",
    });
  } finally {
    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(workflowDefinitions)
          .where(eq(workflowDefinitions.id, workflowId));
        await tx.delete(documents).where(eq(documents.id, documentId));
        await tx
          .delete(signatureEnvelopes)
          .where(eq(signatureEnvelopes.id, envelopeId));
      });
    } finally {
      await sql.end();
    }
  }
});
