import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PDFDocument } from "pdf-lib";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  createDatabaseClient,
  domainEventOutbox,
  documentVersions,
  documents,
  emailOutbox,
  organization,
  signatureEnvelopes,
  signatureRecipients,
  user as authUser,
  workflowDefinitions,
  workflowDefinitionVersions,
  workflowNodeExecutions,
  workflowActionEffects,
  workflowRuns,
  workspaceSettings,
} from "@harly/db";

import { storage } from "@/lib/storage";
import { decryptSecret, type EncryptedSecret } from "@/lib/crypto";
import { semanticGraphHash } from "@/features/automations/definition/hash";
import type { WorkflowGraphV2 } from "@/features/automations/definition/schema-v2";
import { findDueWorkflowRuns } from "@/features/automations/runtime/due-runs";

const outboxMock = vi.hoisted(() => ({ processEmailOutbox: vi.fn() }));
vi.mock("@/lib/email/outbox-processor", () => ({
  processEmailOutbox: outboxMock.processEmailOutbox,
}));

const databaseUrl = process.env.AUTOMATIONS_TEST_DATABASE_URL;
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (
    !parsed.pathname.startsWith("/harly_automations_verify_") ||
    !["localhost", "127.0.0.1"].includes(parsed.hostname)
  ) {
    throw new Error("Use an isolated local automations verification database");
  }
  if (process.env.DATABASE_URL !== databaseUrl) {
    throw new Error("Set DATABASE_URL to the same isolated URL as AUTOMATIONS_TEST_DATABASE_URL");
  }
}

describe.skipIf(!databaseUrl)("native multi-signer document continuation", () => {
  const client = databaseUrl ? createDatabaseClient(databaseUrl) : null;
  const workspaceId = `native-sign-test-${randomUUID()}`;
  const actorId = `native-sign-user-${randomUUID()}`;
  const workflowId = randomUUID();
  const versionId = randomUUID();
  const documentId = randomUUID();
  const envelopeId = randomUUID();
  const runId = randomUUID();
  const effectKey = `native-sign-effect-${randomUUID()}`;
  const firstRecipientId = randomUUID();
  const secondRecipientId = randomUUID();
  const firstToken = randomBytes(32).toString("base64url");
  const providerEnvelopeId = `native:${randomUUID()}`;
  const initialStorageKey = `tests/${documentId}/unsigned.pdf`;
  const signingFields = [
    {
      id: randomUUID(), type: "signature", page: 1, x: 0.08, y: 0.72,
      w: 0.28, h: 0.1, label: null, required: true, order: 0, recipientIndex: 0,
    },
    {
      id: randomUUID(), type: "signature", page: 1, x: 0.62, y: 0.72,
      w: 0.28, h: 0.1, label: null, required: true, order: 1, recipientIndex: 1,
    },
  ];
  let fixtureCreated = false;
  let uploadDir: string | null = null;
  const previousUploadsDir = process.env.UPLOADS_DIR;
  const previousEncryptionKey = process.env.AI_ENCRYPTION_KEY;
  const previousHarlyUrl = process.env.HARLY_URL;

  beforeAll(async () => {
    if (!client) return;
    uploadDir = await mkdtemp(path.join(os.tmpdir(), "harly-native-sign-test-"));
    process.env.UPLOADS_DIR = uploadDir;
    process.env.AI_ENCRYPTION_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";
    process.env.HARLY_URL ??= "http://localhost:3000";

    await client.db.insert(organization).values({
      id: workspaceId,
      name: "Native multi-signer test",
      slug: workspaceId,
      createdAt: new Date(),
    });
    fixtureCreated = true;
    await client.db.insert(authUser).values({
      id: actorId,
      name: "Native signing test actor",
      email: `${actorId}@example.test`,
    });
    await client.db.insert(workspaceSettings).values({
      organizationId: workspaceId,
      remoteSignEnabled: true,
      signatureSecurityMode: "link_only",
    });
  });

  afterAll(async () => {
    if (client) {
      try {
        if (fixtureCreated) {
          await client.db.delete(organization).where(eq(organization.id, workspaceId));
          await client.db.delete(authUser).where(eq(authUser.id, actorId));
        }
      } finally {
        await client.sql.end();
      }
    }
    if (previousUploadsDir === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = previousUploadsDir;
    if (previousEncryptionKey === undefined) delete process.env.AI_ENCRYPTION_KEY;
    else process.env.AI_ENCRYPTION_KEY = previousEncryptionKey;
    if (previousHarlyUrl === undefined) delete process.env.HARLY_URL;
    else process.env.HARLY_URL = previousHarlyUrl;
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
  });

  it("hands the invitation to signer 2 and resumes the wait only after signer 2 completes", async () => {
    vi.clearAllMocks();
    outboxMock.processEmailOutbox.mockResolvedValue({ processed: 1, sent: 1, failed: 0 });

    const pdf = await PDFDocument.create();
    pdf.addPage([612, 792]);
    const unsignedPdf = Buffer.from(await pdf.save());
    await storage.put(initialStorageKey, unsignedPdf, "application/pdf");

    await client!.db.insert(signatureEnvelopes).values({
      id: envelopeId,
      workspaceId,
      provider: "native",
      providerEnvelopeId,
      kind: "document",
      status: "sent",
      subject: "Employment agreement",
      createdById: actorId,
      workflowEffectId: effectKey,
      sentAt: new Date(),
      fieldsSnapshot: signingFields,
    });
    await client!.db.insert(documents).values({
      id: documentId,
      workspaceId,
      name: "Employment agreement.pdf",
      originalName: "Employment agreement.pdf",
      mimeType: "application/pdf",
      sizeBytes: unsignedPdf.byteLength,
      checksum: createHash("sha256").update(unsignedPdf).digest("hex"),
      storageKey: initialStorageKey,
      signatureStatus: "pending",
      signatureProvider: "native",
      signatureEnvelopeId: providerEnvelopeId,
      signatureEnvelopeRefId: envelopeId,
      fieldsSnapshot: signingFields,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdById: actorId,
    });
    await client!.db.insert(documentVersions).values({
      workspaceId,
      documentId,
      versionNumber: 1,
      storageKey: initialStorageKey,
      sizeBytes: unsignedPdf.byteLength,
      checksum: createHash("sha256").update(unsignedPdf).digest("hex"),
      uploadedById: actorId,
      isCurrent: true,
    });
    await client!.db.insert(signatureRecipients).values([
      {
        id: firstRecipientId,
        workspaceId,
        envelopeId,
        providerRecipientId: `native-token:${createHash("sha256").update(firstToken).digest("hex")}`,
        role: "signer",
        email: "first.signer@example.test",
        name: "First Signer",
        routingOrder: 1,
        status: "sent",
        linkExpiresAt: new Date(Date.now() + 86_400_000),
      },
      {
        id: secondRecipientId,
        workspaceId,
        envelopeId,
        providerRecipientId: `native-pending:1:${randomUUID()}`,
        role: "signer",
        email: "second.signer@example.test",
        name: "Second Signer",
        routingOrder: 2,
        status: "created",
        linkExpiresAt: new Date(Date.now() + 86_400_000),
      },
    ]);

    const graph: WorkflowGraphV2 = {
      schemaVersion: 2,
      entryNodeId: "trigger",
      nodes: [
        { id: "trigger", type: "trigger", event: "application.created", filter: {} },
        {
          id: "signature-wait",
          type: "wait",
          kind: "document_package",
          resourceType: "document",
          resourceId: { kind: "literal", value: documentId },
        },
        { id: "completed", type: "end", result: "completed" },
        { id: "stopped", type: "end", result: "stopped" },
      ],
      edges: [
        { id: "e1", source: "trigger", port: "next", target: "signature-wait" },
        { id: "e2", source: "signature-wait", port: "completed", target: "completed" },
        { id: "e3", source: "signature-wait", port: "declined", target: "stopped" },
        { id: "e4", source: "signature-wait", port: "cancelled", target: "stopped" },
        { id: "e5", source: "signature-wait", port: "expired", target: "stopped" },
      ],
    };
    await client!.db.insert(workflowDefinitions).values({
      id: workflowId,
      workspaceId,
      name: "Multi-signer continuation test",
      triggerEvent: "application.created",
      trigger: { event: "application.created" },
      conditions: [],
      actions: [],
      enabled: true,
      status: "published",
      engineVersion: 2,
      publishedVersionId: versionId,
    });
    await client!.db.insert(workflowDefinitionVersions).values({
      id: versionId,
      workflowId,
      workspaceId,
      name: "Multi-signer continuation test",
      version: 1,
      schemaVersion: 2,
      graph,
      contentHash: semanticGraphHash(graph),
      publishedAt: new Date(),
      createdById: actorId,
      triggerEvent: "application.created",
      trigger: {},
      conditions: [],
      actions: [],
    });
    await client!.db.insert(workflowRuns).values({
      id: runId,
      workspaceId,
      workflowId,
      triggerEvent: "application.created",
      engineVersion: 2,
      versionId,
      logicalStatus: "queued",
      cursorNodeId: graph.entryNodeId,
      contextSnapshot: {},
    });
    await client!.db.insert(workflowActionEffects).values({
      workspaceId,
      runId,
      stepIndex: 0,
      effectKey,
      status: "completed",
      result: { envelopeId },
      finishedAt: new Date(),
    });

    const worker = await import("@/features/automations/runtime/worker");
    const { finalizeNativeSignature } = await import("./finalize");
    const { resolveNativeSigningToken } = await import("./remote");
    expect((await worker.runWorkflowV2(runId, { database: client!.db })).status).toBe("waiting");

    outboxMock.processEmailOutbox.mockRejectedValueOnce(new Error("simulated mail transport outage"));
    const signaturePngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
      "base64",
    );
    expect(await resolveNativeSigningToken(firstToken)).toMatchObject({
      recipientId: firstRecipientId,
      routingOrder: 1,
      signerCount: 2,
    });

    const firstSigned = await finalizeNativeSignature({
      database: client!.db,
      workspaceId,
      documentId,
      actorId,
      signerName: "First Signer",
      signerEmail: "first.signer@example.test",
      signaturePngBytes,
      verification: "link_only",
      existingEnvelopeId: envelopeId,
      existingRecipientId: firstRecipientId,
    });
    expect(firstSigned.complete).toBe(false);
    expect(firstSigned.nextOutboxId).toBeTruthy();
    expect(await resolveNativeSigningToken(firstToken)).toBeNull();

    const [partiallySignedDocument] = await client!.db
      .select({ storageKey: documents.storageKey, signatureStatus: documents.signatureStatus })
      .from(documents)
      .where(eq(documents.id, documentId));
    expect(partiallySignedDocument?.signatureStatus).toBe("pending");
    expect(partiallySignedDocument?.storageKey).toBe(initialStorageKey);
    const [signatureEvent] = await client!.db
      .select({ automationParentRunId: domainEventOutbox.automationParentRunId })
      .from(domainEventOutbox)
      .where(and(
        eq(domainEventOutbox.workspaceId, workspaceId),
        eq(domainEventOutbox.eventName, "document.signature_changed"),
      ));
    expect(signatureEvent?.automationParentRunId).toBe(runId);

    const [secondInvitation] = await client!.db
      .select()
      .from(emailOutbox)
      .where(and(eq(emailOutbox.workspaceId, workspaceId), eq(emailOutbox.id, firstSigned.nextOutboxId!)))
      .limit(1);
    expect(secondInvitation?.payload).toMatchObject({ recipientEmail: "second.signer@example.test" });
    expect(outboxMock.processEmailOutbox).toHaveBeenCalledWith({
      ids: [firstSigned.nextOutboxId],
      workspaceId,
      database: client!.db,
    });
    const secondToken = decryptSecret((secondInvitation!.payload as { token: EncryptedSecret }).token);
    expect(await resolveNativeSigningToken(secondToken)).toMatchObject({
      recipientId: secondRecipientId,
      routingOrder: 2,
      signerCount: 2,
    });
    const [waitingRun] = await client!.db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
    expect(waitingRun?.logicalStatus).toBe("waiting");

    const resumeSpy = vi.spyOn(worker, "resumeWorkflowDocumentWaits")
      .mockRejectedValueOnce(new Error("simulated post-commit wait-resume outage"));
    const secondSigned = await finalizeNativeSignature({
      database: client!.db,
      workspaceId,
      documentId,
      actorId,
      signerName: "Second Signer",
      signerEmail: "second.signer@example.test",
      signaturePngBytes,
      verification: "link_only",
      existingEnvelopeId: envelopeId,
      existingRecipientId: secondRecipientId,
    });
    expect(secondSigned.complete).toBe(true);
    expect(secondSigned.nextOutboxId).toBeNull();
    expect(await resolveNativeSigningToken(secondToken)).toBeNull();
    const [signedAfterWakeFailure] = await client!.db
      .select({ storageKey: documents.storageKey, signatureStatus: documents.signatureStatus })
      .from(documents)
      .where(eq(documents.id, documentId));
    expect(signedAfterWakeFailure?.signatureStatus).toBe("signed");
    expect(await storage.read(signedAfterWakeFailure!.storageKey)).toBeInstanceOf(Buffer);
    expect(await findDueWorkflowRuns(client!.db)).toEqual(expect.arrayContaining([
      { id: runId, engineVersion: 2 },
    ]));
    resumeSpy.mockRestore();
    expect((await worker.runWorkflowV2(runId, {
      database: client!.db,
      workerId: "signature-wake-reconciler",
    })).status).toBe("succeeded");

    const [completedDocument] = await client!.db.select().from(documents).where(eq(documents.id, documentId));
    const [completedEnvelope] = await client!.db.select().from(signatureEnvelopes).where(eq(signatureEnvelopes.id, envelopeId));
    const completedRecipients = await client!.db
      .select({ id: signatureRecipients.id, status: signatureRecipients.status, routingOrder: signatureRecipients.routingOrder })
      .from(signatureRecipients)
      .where(eq(signatureRecipients.envelopeId, envelopeId));
    const [completedRun] = await client!.db.select().from(workflowRuns).where(eq(workflowRuns.id, runId));
    const [waitExecution] = await client!.db.select().from(workflowNodeExecutions).where(
      and(eq(workflowNodeExecutions.runId, runId), eq(workflowNodeExecutions.nodeId, "signature-wait")),
    );
    expect(completedDocument?.signatureStatus).toBe("signed");
    expect(completedEnvelope?.status).toBe("completed");
    expect(completedRecipients.sort((a, b) => a.routingOrder - b.routingOrder).map((row) => row.status)).toEqual(["signed", "signed"]);
    expect(completedRun?.logicalStatus).toBe("succeeded");
    expect(waitExecution).toMatchObject({ status: "succeeded", resolvedPort: "completed" });
  });
});
