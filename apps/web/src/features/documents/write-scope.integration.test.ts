import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

import {
  applications,
  customRoles,
  db,
  documentAccessRoles,
  documentAssociations,
  documentRequests,
  documents,
  offers,
} from "@harly/db";

import {
  createAuthorizationFixture,
  type ActorKey,
  type AuthorizationFixture,
} from "@/test-support/authorization-fixture";
import { runPipelineIntegration } from "@/test-support/pipeline-fixture";

const ctx = vi.hoisted(() => ({
  workspaceId: "",
  userId: "",
  roleKey: "owner",
}));

const mocks = vi.hoisted(() => ({
  sendDocumentForEnvelope: vi.fn(async () => ({ ok: false as const, error: "envelope stub" })),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/workspaces/context", () => {
  const context = () => ({
    organization: { id: ctx.workspaceId, name: "Auth", slug: "auth" },
    user: { id: ctx.userId, email: "auth@example.test", name: "Auth User", image: null },
    membership: { id: "member", role: ctx.roleKey },
    role: ctx.roleKey,
    roleKey: ctx.roleKey,
    session: {},
  });
  return {
    getWorkspaceContext: vi.fn(async () => context()),
    getWorkspaceContextOrNull: vi.fn(async () => context()),
  };
});
vi.mock("./verify", () => ({
  verifyUploadedDocument: vi.fn(async () => ({ checksum: "verified-checksum" })),
}));
vi.mock("@/lib/storage", () => ({ storage: { delete: vi.fn(async () => undefined), read: vi.fn() } }));
vi.mock("@/lib/esign/document-signing", () => ({ sendDocumentForEnvelope: mocks.sendDocumentForEnvelope }));
vi.mock("@/lib/esign/client", () => ({ archiveSubmission: vi.fn(), freshEsignContext: vi.fn(async () => null) }));
vi.mock("@/server/events/emit", () => ({
  persistDomainEvent: vi.fn(async () => ({ eventId: "event", name: "event" })),
  publishPersistedDomainEvents: vi.fn(async () => undefined),
}));
vi.mock("@/lib/esign/document-automation-context", () => ({
  documentAutomationContext: vi.fn(async () => ({})),
}));
vi.mock("@/lib/esign/native/remote", () => ({ createNativeSigningLink: vi.fn() }));
vi.mock("@/lib/esign/native/finalize", () => ({ finalizeNativeSignature: vi.fn() }));
vi.mock("@/features/automations/runtime/worker", () => ({ resumeWorkflowDocumentWaits: vi.fn(async () => undefined) }));
vi.mock("@/server/webhooks/emit", () => ({ emitWebhookEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/email/outbox-processor", () => ({
  enqueueOfferEmail: vi.fn(async () => undefined),
  drainOutboxForKeys: vi.fn(async () => undefined),
}));
vi.mock("@/lib/esign/offer-signing", () => ({
  offerSigningStatusFor: vi.fn(),
  sendOfferForSignature: vi.fn(),
  ensureOfferSignatureTarget: vi.fn(),
}));
vi.mock("@/lib/esign/native/offer-signing", () => ({
  sendNativeOfferForSignature: vi.fn(),
  nativeOfferSignatureEnabled: vi.fn(async () => false),
}));
vi.mock("@/lib/esign/config", () => ({ getWorkspaceEsignStatus: vi.fn(async () => ({ configured: false })) }));

import { createDocument, renameDocument, saveDocumentAcl } from "./actions";
import { requestDocuments, reviewDocumentRequest, waiveDocumentRequest, cancelDocumentRequest } from "./requests-actions";
import { sendDocumentForSignature } from "./actions";
import { signDocumentNatively } from "./native-sign-actions";
import { createOffer } from "@/features/offers/actions";

describe.skipIf(!runPipelineIntegration)("document writes respect candidate and job scope (database)", () => {
  let fx: AuthorizationFixture;
  let scopedRoleKey: string;
  let fullRoleKey: string;
  const tag = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  let applicationOnA: string;
  let applicationOnB: string;

  function actAs(key: ActorKey) {
    ctx.workspaceId = fx.workspaceId;
    ctx.userId = fx.users[key];
    ctx.roleKey = key === "scoped" ? scopedRoleKey : fullRoleKey;
  }

  async function makeDocument(
    label: string,
    options: {
      associations?: Array<{ targetType: string; targetId: string | null }>;
      aclRoleKey?: string;
      aclLevel?: "read" | "manage";
    } = {},
  ) {
    const [row] = await db
      .insert(documents)
      .values({
        workspaceId: fx.workspaceId,
        name: `Write ${label} ${tag}`,
        originalName: `${label}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 10,
        checksum: randomUUID(),
        storageKey: `documents/${randomUUID()}.pdf`,
        ownerId: fx.users.full,
        createdById: fx.users.full,
      })
      .returning({ id: documents.id });
    ids[label] = row!.id;
    if (options.associations?.length) {
      await db.insert(documentAssociations).values(
        options.associations.map((association) => ({
          workspaceId: fx.workspaceId,
          documentId: row!.id,
          targetType: association.targetType,
          targetId: association.targetId,
          createdById: fx.users.full,
        })),
      );
    }
    if (options.aclRoleKey) {
      await db.insert(documentAccessRoles).values({
        workspaceId: fx.workspaceId,
        documentId: row!.id,
        roleKey: options.aclRoleKey,
        accessLevel: options.aclLevel ?? "read",
      });
    }
    return row!.id;
  }

  async function documentName(id: string) {
    const [row] = await db.select({ name: documents.name }).from(documents).where(eq(documents.id, id));
    return row?.name;
  }

  async function aclRoleCount(id: string) {
    const rows = await db.select({ roleKey: documentAccessRoles.roleKey }).from(documentAccessRoles).where(eq(documentAccessRoles.documentId, id));
    return rows.length;
  }

  beforeAll(async () => {
    fx = await createAuthorizationFixture();
    scopedRoleKey = `write-scoped-${tag}`;
    fullRoleKey = `write-full-${tag}`;
    const documentPermissions = [
      "candidates:view",
      "jobs:view",
      "documents:read",
      "documents:manage",
      "documents:share",
      "offers:manage",
    ] as const;
    await db.insert(customRoles).values([
      {
        workspaceId: fx.workspaceId,
        key: scopedRoleKey,
        name: "Document writer, assigned jobs",
        permissions: [...documentPermissions],
        scope: { jobAccess: "assigned", departments: [], regions: [] },
      },
      {
        workspaceId: fx.workspaceId,
        key: fullRoleKey,
        name: "Document writer, all jobs",
        permissions: [...documentPermissions],
        scope: { jobAccess: "all", departments: [], regions: [] },
      },
    ]);

    await makeDocument("outOfScope", {
      associations: [{ targetType: "candidate", targetId: fx.candidateB }],
    });
    await makeDocument("aclManageOnOutOfScope", {
      associations: [{ targetType: "candidate", targetId: fx.candidateB }],
      aclRoleKey: scopedRoleKey,
      aclLevel: "manage",
    });
    await makeDocument("inScope", {
      associations: [{ targetType: "candidate", targetId: fx.candidateA }],
    });

    const applications_ = await db
      .select({ id: applications.id, candidateId: applications.candidateId, jobId: applications.jobId })
      .from(applications)
      .where(eq(applications.workspaceId, fx.workspaceId));
    applicationOnA = applications_.find((row) => row.candidateId === fx.candidateA && row.jobId === fx.jobA)!.id;
    applicationOnB = applications_.find((row) => row.candidateId === fx.candidateB && row.jobId === fx.jobB)!.id;
  });

  afterAll(async () => {
    await fx?.cleanup();
  });

  describe("document actions on a record outside the caller's scope", () => {
    it("refuses to rename an out-of-scope document", async () => {
      actAs("scoped");
      const before = await documentName(ids.outOfScope);
      const result = await renameDocument({ documentId: ids.outOfScope, name: `Renamed ${tag}` });
      expect(result.ok).toBe(false);
      expect(await documentName(ids.outOfScope)).toBe(before);
    });

    it("keeps an explicit ACL manage grant authoritative for a rename", async () => {
      actAs("scoped");
      const result = await renameDocument({ documentId: ids.aclManageOnOutOfScope, name: `Granted ${tag}` });
      expect(result.ok).toBe(true);
      expect(await documentName(ids.aclManageOnOutOfScope)).toBe(`Granted ${tag}`);
    });

    it("refuses to change sharing on an out-of-scope document", async () => {
      actAs("scoped");
      const result = await saveDocumentAcl({
        documentId: ids.outOfScope,
        roles: [{ roleKey: scopedRoleKey, accessLevel: "manage" }],
        members: [],
      });
      expect(result.ok).toBe(false);
      expect(await aclRoleCount(ids.outOfScope)).toBe(0);
    });

    it("refuses to send an out-of-scope document for signature", async () => {
      actAs("scoped");
      mocks.sendDocumentForEnvelope.mockClear();
      const result = await sendDocumentForSignature({
        documentId: ids.outOfScope,
        recipientEmail: "signer@example.test",
        recipientName: "Signer",
        subject: "Please sign",
      });
      expect(result.ok).toBe(false);
      expect(mocks.sendDocumentForEnvelope).not.toHaveBeenCalled();
    });

    it("refuses to sign an out-of-scope document natively", async () => {
      actAs("scoped");
      const result = await signDocumentNatively({
        documentId: ids.outOfScope,
        placements: [{ page: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.05 }],
        savedSignatureId: randomUUID(),
      });
      expect(result.ok).toBe(false);
      const [row] = await db.select({ status: documents.signatureStatus }).from(documents).where(eq(documents.id, ids.outOfScope));
      expect(row?.status).toBe("unsigned");
    });
  });

  describe("document associations written on upload", () => {
    const upload = (association: { targetType: "candidate" | "application"; targetId: string }) => ({
      name: `Upload ${association.targetType} ${tag}`,
      originalName: "upload.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      checksum: randomUUID(),
      storageKey: `documents/${randomUUID()}.pdf`,
      categoryId: null,
      association,
    });

    it("refuses an association to a candidate outside the caller's scope and stores nothing", async () => {
      actAs("scoped");
      const input = upload({ targetType: "candidate", targetId: fx.candidateB });
      const result = await createDocument(input);
      expect(result.ok).toBe(false);
      const stored = await db.select({ id: documents.id }).from(documents).where(eq(documents.name, input.name));
      expect(stored).toHaveLength(0);
    });

    it("refuses an association to an application outside the caller's scope", async () => {
      actAs("scoped");
      const input = upload({ targetType: "application", targetId: applicationOnB });
      const result = await createDocument(input);
      expect(result.ok).toBe(false);
      const stored = await db.select({ id: documents.id }).from(documents).where(eq(documents.name, input.name));
      expect(stored).toHaveLength(0);
    });

    it("accepts an association to a candidate inside the caller's scope", async () => {
      actAs("scoped");
      const result = await createDocument(upload({ targetType: "candidate", targetId: fx.candidateA }));
      expect(result.ok).toBe(true);
    });

    it("accepts an association to a candidate outside the scope for an unrestricted caller", async () => {
      actAs("full");
      const result = await createDocument(upload({ targetType: "candidate", targetId: fx.candidateB }));
      expect(result.ok).toBe(true);
    });
  });

  describe("document requests on an application outside the caller's scope", () => {
    let submittedRequestId: string;
    let waivableRequestId: string;
    let cancellableRequestId: string;

    beforeAll(async () => {
      const rows = await db
        .insert(documentRequests)
        .values([
          { workspaceId: fx.workspaceId, applicationId: applicationOnB, candidateId: fx.candidateB, title: `Passport ${tag}`, status: "submitted" },
          { workspaceId: fx.workspaceId, applicationId: applicationOnB, candidateId: fx.candidateB, title: `Reference ${tag}`, status: "pending" },
          { workspaceId: fx.workspaceId, applicationId: applicationOnB, candidateId: fx.candidateB, title: `Visa ${tag}`, status: "pending" },
        ])
        .returning({ id: documentRequests.id });
      submittedRequestId = rows[0]!.id;
      waivableRequestId = rows[1]!.id;
      cancellableRequestId = rows[2]!.id;
    });

    async function requestStatus(id: string) {
      const [row] = await db.select({ status: documentRequests.status }).from(documentRequests).where(eq(documentRequests.id, id));
      return row?.status;
    }

    it("refuses to request documents for an application outside the caller's scope", async () => {
      actAs("scoped");
      const result = await requestDocuments({
        applicationId: applicationOnB,
        items: [{ title: `Unauthorised ${tag}` }],
      });
      expect(result.ok).toBe(false);
      const created = await db
        .select({ id: documentRequests.id })
        .from(documentRequests)
        .where(and(eq(documentRequests.applicationId, applicationOnB), eq(documentRequests.title, `Unauthorised ${tag}`)));
      expect(created).toHaveLength(0);
    });

    it("refuses to accept a submitted request on an out-of-scope application", async () => {
      actAs("scoped");
      const result = await reviewDocumentRequest({ requestId: submittedRequestId, decision: "accepted" });
      expect(result.ok).toBe(false);
      expect(await requestStatus(submittedRequestId)).toBe("submitted");
    });

    it("refuses to waive a request on an out-of-scope application", async () => {
      actAs("scoped");
      const result = await waiveDocumentRequest({ requestId: waivableRequestId });
      expect(result.ok).toBe(false);
      expect(await requestStatus(waivableRequestId)).toBe("pending");
    });

    it("refuses to cancel a request on an out-of-scope application", async () => {
      actAs("scoped");
      const result = await cancelDocumentRequest({ requestId: cancellableRequestId });
      expect(result.ok).toBe(false);
      expect(await requestStatus(cancellableRequestId)).toBe("pending");
    });

    it("lets an unrestricted caller review the same request", async () => {
      actAs("full");
      const result = await reviewDocumentRequest({ requestId: submittedRequestId, decision: "accepted" });
      expect(result.ok).toBe(true);
      expect(await requestStatus(submittedRequestId)).toBe("accepted");
    });
  });

  describe("offer documents", () => {
    it("refuses to attach an out-of-scope document to an offer", async () => {
      actAs("scoped");
      const title = `Scoped offer ${tag}`;
      const result = await createOffer({
        applicationId: applicationOnA,
        title,
        salaryAmount: null,
        currency: null,
        salaryPeriod: null,
        equity: null,
        startDate: null,
        expiresAt: null,
        notes: null,
        documentIds: [ids.outOfScope],
      });
      expect(result.success).toBe(false);
      const created = await db.select({ id: offers.id }).from(offers).where(eq(offers.title, title));
      expect(created).toHaveLength(0);
    });

    it("attaches an in-scope document to an offer", async () => {
      actAs("scoped");
      const result = await createOffer({
        applicationId: applicationOnA,
        title: `Attach in scope ${tag}`,
        salaryAmount: null,
        currency: null,
        salaryPeriod: null,
        equity: null,
        startDate: null,
        expiresAt: null,
        notes: null,
        documentIds: [ids.inScope],
      });
      expect(result.success).toBe(true);
    });
  });
});
