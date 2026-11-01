import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { PDFDocument } from "pdf-lib";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  db,
  documentVersions,
  documents,
  organization,
  signatureEnvelopes,
  signatureRecipients,
  user as authUser,
  workspaceSettings,
} from "@harly/db";

import { runPipelineIntegration } from "@/test-support/pipeline-fixture";

const ctx = vi.hoisted(() => {
  // Signing links and webhooks build absolute URLs at import time.
  process.env.HARLY_URL ??= "http://localhost:3000";
  return { workspaceId: "", userId: "" };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email/outbox-processor", () => ({
  processEmailOutbox: vi.fn(async () => ({ processed: 0, sent: 0, failed: 0 })),
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: vi.fn(async () => ({
    organization: { id: ctx.workspaceId },
    user: { id: ctx.userId },
    roleKey: "owner",
  })),
  requireOwnerOrAdmin: vi.fn(),
  getRolePolicy: vi.fn(),
}));
// The replacement's pre-transaction read: it sees the document before signing
// commits, which is exactly the stale view the lock must correct.
vi.mock("@/features/documents/scope-access", () => ({
  resolveDocumentAccessInScope: vi.fn(async () => ({
    level: "manage",
    document: { status: "active", signatureStatus: "unsigned", archivedAt: null },
  })),
  associationTargetsInScope: vi.fn(),
}));
vi.mock("@/features/documents/verify", () => ({
  verifyUploadedDocument: vi.fn(async () => ({ checksum: "replacement-checksum" })),
}));

import { createDocumentVersion } from "@/features/documents/actions";
import { finalizeNativeSignature } from "./finalize";
import { createNativeSigningLink } from "./remote";
import { getNativeSignatureTimeline } from "./timeline";

const signaturePngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
  "base64",
);

describe.skipIf(!runPipelineIntegration)("native signing under concurrency (database)", () => {
  const workspaceId = `esign-concurrency-${randomUUID()}`;
  const actorId = `esign-concurrency-user-${randomUUID()}`;
  let uploadDir: string | null = null;
  let pdfBytes: Buffer;
  const previousUploadsDir = process.env.UPLOADS_DIR;
  const previousEncryptionKey = process.env.AI_ENCRYPTION_KEY;

  async function createDocument(signatureStatus: "unsigned" | "pending" = "unsigned") {
    const id = randomUUID();
    const storageKey = `tests/${id}/unsigned.pdf`;
    const { storage } = await import("@/lib/storage");
    await storage.put(storageKey, pdfBytes, "application/pdf");
    const checksum = createHash("sha256").update(pdfBytes).digest("hex");
    await db.insert(documents).values({
      id,
      workspaceId,
      name: `Agreement ${id.slice(0, 8)}.pdf`,
      originalName: "Agreement.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytes.byteLength,
      checksum,
      storageKey,
      signatureStatus,
      fieldsSnapshot: [
        { id: randomUUID(), type: "signature", page: 1, x: 0.1, y: 0.7, w: 0.3, h: 0.1, label: null, required: true, order: 0, recipientIndex: 0 },
      ],
      createdById: actorId,
    });
    await db.insert(documentVersions).values({
      workspaceId,
      documentId: id,
      versionNumber: 1,
      storageKey,
      sizeBytes: pdfBytes.byteLength,
      checksum,
      uploadedById: actorId,
      isCurrent: true,
    });
    return { id, storageKey };
  }

  const send = (documentId: string, email: string) =>
    createNativeSigningLink({ workspaceId, documentId, actorId, recipients: [{ email, name: "Ada Lovelace" }] });

  beforeAll(async () => {
    uploadDir = await mkdtemp(path.join(os.tmpdir(), "harly-esign-concurrency-"));
    process.env.UPLOADS_DIR = uploadDir;
    process.env.AI_ENCRYPTION_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";
    ctx.workspaceId = workspaceId;
    ctx.userId = actorId;
    const pdf = await PDFDocument.create();
    pdf.addPage([612, 792]);
    pdfBytes = Buffer.from(await pdf.save());
    await db.insert(organization).values({ id: workspaceId, name: "E-sign concurrency", slug: workspaceId, createdAt: new Date() });
    await db.insert(authUser).values({ id: actorId, name: "E-sign concurrency actor", email: `${actorId}@example.test` });
    await db.insert(workspaceSettings).values({ organizationId: workspaceId, remoteSignEnabled: true, signatureSecurityMode: "link_only" });
  });

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, workspaceId));
    await db.delete(authUser).where(eq(authUser.id, actorId));
    if (previousUploadsDir === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = previousUploadsDir;
    if (previousEncryptionKey === undefined) delete process.env.AI_ENCRYPTION_KEY;
    else process.env.AI_ENCRYPTION_KEY = previousEncryptionKey;
    if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
  });

  it("opens exactly one signing workflow when two sends race on the same document", async () => {
    const document = await createDocument();

    const results = await Promise.all([
      send(document.id, "first@example.test"),
      send(document.id, "second@example.test"),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.find((result) => !result.ok)).toMatchObject({ ok: false, error: expect.stringMatching(/already sent for signature/) });
    const envelopes = await db
      .select({ id: signatureEnvelopes.id })
      .from(signatureEnvelopes)
      .where(and(eq(signatureEnvelopes.workspaceId, workspaceId), eq(signatureEnvelopes.documentId, document.id)));
    expect(envelopes).toHaveLength(1);
    const recipients = await db
      .select({ email: signatureRecipients.email })
      .from(signatureRecipients)
      .where(eq(signatureRecipients.envelopeId, envelopes[0]!.id));
    const winner = results.findIndex((result) => result.ok);
    expect(recipients.map((row) => row.email)).toEqual([winner === 0 ? "first@example.test" : "second@example.test"]);
    const [row] = await db.select({ signatureStatus: documents.signatureStatus }).from(documents).where(eq(documents.id, document.id));
    expect(row?.signatureStatus).toBe("pending");
  });

  it("refuses a replacement that was verified before a signature committed", async () => {
    const document = await createDocument();
    let locked!: () => void;
    const lockHeld = new Promise<void>((resolve) => (locked = resolve));
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));

    // Stand in for signing finalization: hold the document lock, then commit
    // the signed state while the replacement is waiting on that lock.
    const signing = db.transaction(async (tx) => {
      await tx.select({ id: documents.id }).from(documents).where(eq(documents.id, document.id)).for("update");
      locked();
      await released;
      await tx.update(documents).set({ signatureStatus: "signed" }).where(eq(documents.id, document.id));
    });
    await lockHeld;
    const replacement = createDocumentVersion({
      documentId: document.id,
      originalName: "Replacement.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdfBytes.byteLength,
      checksum: "replacement-checksum",
      storageKey: `tests/${document.id}/replacement.pdf`,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    release();
    await signing;

    await expect(replacement).resolves.toEqual({ ok: false, error: expect.stringMatching(/cannot be replaced/) });
    const [row] = await db.select({ storageKey: documents.storageKey }).from(documents).where(eq(documents.id, document.id));
    expect(row?.storageKey).toBe(document.storageKey);
    const versions = await db.select({ versionNumber: documentVersions.versionNumber }).from(documentVersions).where(eq(documentVersions.documentId, document.id));
    expect(versions.map((version) => version.versionNumber)).toEqual([1]);
  });

  // A deadlock needs one path to hold the version row while waiting for the
  // document row. So while the document row is held elsewhere, each path must
  // be waiting on it without having taken the version row yet.
  async function versionRowFreeWhileDocumentHeld(documentId: string, start: () => Promise<unknown>) {
    let locked!: () => void;
    const lockHeld = new Promise<void>((resolve) => (locked = resolve));
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const holder = db.transaction(async (tx) => {
      await tx.select({ id: documents.id }).from(documents).where(eq(documents.id, documentId)).for("update");
      locked();
      await released;
    });
    await lockHeld;
    const operation = start();
    await new Promise((resolve) => setTimeout(resolve, 300));
    let versionFree = true;
    try {
      await db.transaction(async (tx) => {
        await tx.select({ id: documentVersions.id }).from(documentVersions).where(eq(documentVersions.documentId, documentId)).for("update", { noWait: true });
      });
    } catch {
      versionFree = false;
    }
    release();
    await holder;
    return { versionFree, result: await operation };
  }

  it("self-signing takes the document lock before the version lock", async () => {
    const document = await createDocument();
    const { versionFree, result } = await versionRowFreeWhileDocumentHeld(document.id, () =>
      finalizeNativeSignature({
        workspaceId,
        documentId: document.id,
        actorId,
        signerName: "Ada Lovelace",
        signerEmail: `${actorId}@example.test`,
        signaturePngBytes,
        verification: "self_sign",
      }),
    );
    expect(versionFree).toBe(true);
    expect(result).toMatchObject({ complete: true });
  });

  it("replacing a document takes the document lock before the version lock", async () => {
    const document = await createDocument();
    const { versionFree, result } = await versionRowFreeWhileDocumentHeld(document.id, () =>
      createDocumentVersion({
        documentId: document.id,
        originalName: "Replacement.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.byteLength,
        checksum: "replacement-checksum",
        storageKey: `tests/${document.id}/replacement.pdf`,
      }),
    );
    expect(versionFree).toBe(true);
    expect(result).toEqual({ ok: true });
  });

  it("an unsigned document survives self-signing and replacement racing", async () => {
    const document = await createDocument();
    const [signed, replaced] = await Promise.allSettled([
      finalizeNativeSignature({
        workspaceId,
        documentId: document.id,
        actorId,
        signerName: "Ada Lovelace",
        signerEmail: `${actorId}@example.test`,
        signaturePngBytes,
        verification: "self_sign",
      }),
      createDocumentVersion({
        documentId: document.id,
        originalName: "Replacement.pdf",
        mimeType: "application/pdf",
        sizeBytes: pdfBytes.byteLength,
        checksum: "replacement-checksum",
        storageKey: `tests/${document.id}/replacement.pdf`,
      }),
    ]);
    // Whichever wins, neither is aborted by Postgres as a deadlock victim.
    for (const outcome of [signed, replaced]) {
      if (outcome.status === "rejected") expect(String(outcome.reason)).not.toMatch(/deadlock/i);
    }
  });

  it("records and shows consent only when the signer gave it", async () => {
    const withoutConsent = await createDocument();
    const withConsent = await createDocument();
    const sentWithout = await send(withoutConsent.id, "no-consent@example.test");
    const sentWith = await send(withConsent.id, "consent@example.test");
    if (!sentWithout.ok || !sentWith.ok) throw new Error("send failed");

    const sign = (documentId: string, envelopeId: string, recipientId: string, consentAt?: Date) =>
      finalizeNativeSignature({
        workspaceId,
        documentId,
        actorId: null,
        signerName: "Ada Lovelace",
        signerEmail: "ada@example.test",
        signaturePngBytes,
        verification: "link_only",
        consentAt,
        existingEnvelopeId: envelopeId,
        existingRecipientId: recipientId,
      });
    await sign(withoutConsent.id, sentWithout.envelopeId, sentWithout.recipientId);
    await sign(withConsent.id, sentWith.envelopeId, sentWith.recipientId, new Date());

    const [bare] = await db
      .select({ consentAt: signatureRecipients.consentAt, consentVersion: signatureRecipients.consentVersion })
      .from(signatureRecipients)
      .where(eq(signatureRecipients.id, sentWithout.recipientId));
    expect(bare).toEqual({ consentAt: null, consentVersion: null });
    const bareTimeline = await getNativeSignatureTimeline({ workspaceId, documentId: withoutConsent.id });
    expect(bareTimeline?.entries.some((entry) => entry.kind === "consented")).toBe(false);

    const consentedTimeline = await getNativeSignatureTimeline({ workspaceId, documentId: withConsent.id });
    expect(consentedTimeline?.entries.some((entry) => entry.kind === "consented")).toBe(true);

    // Data from before 0.3.0 can carry a timestamp with no disclosure version.
    await db
      .update(signatureRecipients)
      .set({ consentAt: new Date() })
      .where(eq(signatureRecipients.id, sentWithout.recipientId));
    const legacyTimeline = await getNativeSignatureTimeline({ workspaceId, documentId: withoutConsent.id });
    expect(legacyTimeline?.entries.some((entry) => entry.kind === "consented")).toBe(false);
    expect(legacyTimeline?.signers[0]?.consentAt).toBeNull();
  });
});
