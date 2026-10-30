import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PDFDocument } from "pdf-lib";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  applications,
  db,
  documentVersions,
  documents,
  jobStages,
  offers,
} from "@harly/db";

import { storage } from "@/lib/storage";
import {
  createPipelineFixture,
  runPipelineIntegration,
  type PipelineFixture,
} from "@/test-support/pipeline-fixture";

const webhookMock = vi.hoisted(() => ({ emitWebhookEvent: vi.fn(async () => undefined) }));
vi.mock("@/server/webhooks/emit", () => webhookMock);
vi.mock("@/lib/email/outbox-processor", () => ({
  processEmailOutbox: vi.fn(async () => ({ processed: 0, sent: 0, failed: 0 })),
}));

import { finalizeNativeSignature } from "@/lib/esign/native/finalize";

// A valid 1x1 PNG used as the drawn signature.
const SIGNATURE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

describe.skipIf(!runPipelineIntegration)("native e-sign acceptance of an offer", () => {
  let fx: PipelineFixture;
  let uploadDir: string;
  const previousUploadsDir = process.env.UPLOADS_DIR;
  const previousEncryptionKey = process.env.AI_ENCRYPTION_KEY;

  beforeAll(async () => {
    uploadDir = await mkdtemp(path.join(os.tmpdir(), "harly-fxl-native-"));
    process.env.UPLOADS_DIR = uploadDir;
    process.env.AI_ENCRYPTION_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";
    fx = await createPipelineFixture();
  });
  afterAll(async () => {
    await fx?.cleanup();
    if (previousUploadsDir === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = previousUploadsDir;
    if (previousEncryptionKey === undefined) delete process.env.AI_ENCRYPTION_KEY;
    else process.env.AI_ENCRYPTION_KEY = previousEncryptionKey;
    await rm(uploadDir, { recursive: true, force: true });
  });

  it("withdraws the candidate's other applications into their withdrawn stage when the offer is signed", async () => {
    const hiredJob = await fx.addJob();
    const otherJob = await fx.addJob();
    const { applicationId, candidateId } = await fx.addApplication({
      stageId: hiredJob.stages.offer!.id,
      jobId: hiredJob.jobId,
    });
    const sibling = await db
      .insert(applications)
      .values({
        workspaceId: fx.workspaceId,
        candidateId,
        jobId: otherJob.jobId,
        currentStageId: otherJob.stages.interview!.id,
      })
      .returning({ id: applications.id });
    const siblingId = sibling[0]!.id;

    const pdf = await PDFDocument.create();
    pdf.addPage([612, 792]);
    const pdfBytes = Buffer.from(await pdf.save());
    const storageKey = `tests/fxl/${applicationId}/offer.pdf`;
    await storage.put(storageKey, pdfBytes, "application/pdf");

    const [document] = await db
      .insert(documents)
      .values({
        workspaceId: fx.workspaceId,
        name: "Offer letter",
        originalName: "offer.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.byteLength,
        checksum: "0".repeat(64),
        storageKey,
        fieldsSnapshot: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            type: "signature",
            page: 1,
            x: 0.08,
            y: 0.72,
            w: 0.28,
            h: 0.1,
            label: null,
            required: true,
            order: 0,
            recipientIndex: 0,
          },
        ],
      })
      .returning({ id: documents.id });

    await db.insert(documentVersions).values({
      workspaceId: fx.workspaceId,
      documentId: document!.id,
      versionNumber: 1,
      storageKey,
      sizeBytes: pdfBytes.byteLength,
      checksum: "0".repeat(64),
      isCurrent: true,
    });

    const [offer] = await db
      .insert(offers)
      .values({
        workspaceId: fx.workspaceId,
        applicationId,
        candidateId,
        jobId: hiredJob.jobId,
        status: "sent",
        title: "Engineer",
        createdById: fx.userId,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      })
      .returning({ id: offers.id });

    await finalizeNativeSignature({
      workspaceId: fx.workspaceId,
      documentId: document!.id,
      actorId: null,
      signerName: "Candidate Tester",
      signerEmail: "candidate-tester@example.test",
      signaturePngBytes: SIGNATURE_PNG,
      verification: "link_only",
      offerId: offer!.id,
    });

    const [hired] = await db
      .select({ status: applications.status, stageId: applications.currentStageId })
      .from(applications)
      .where(eq(applications.id, applicationId));
    expect(hired!.status).toBe("hired");

    const [sibl] = await db
      .select({ status: applications.status, stageId: applications.currentStageId })
      .from(applications)
      .where(eq(applications.id, siblingId));
    expect(sibl!.status).toBe("withdrawn");
    const [stage] = await db
      .select({ kind: jobStages.kind })
      .from(jobStages)
      .where(and(eq(jobStages.id, sibl!.stageId!), eq(jobStages.jobId, otherJob.jobId)));
    expect(stage!.kind).toBe("withdrawn");

    const [signed] = await db
      .select({ signatureStatus: documents.signatureStatus })
      .from(documents)
      .where(eq(documents.id, document!.id));
    expect(signed!.signatureStatus).toBe("signed");
    expect(webhookMock.emitWebhookEvent).toHaveBeenCalledWith(
      fx.workspaceId,
      "application.stage_changed",
      expect.objectContaining({ application: expect.objectContaining({ id: siblingId, status: "withdrawn" }) }),
      expect.anything(),
    );
  });
});
