import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  processEmailOutbox: vi.fn(),
  encryptSecret: vi.fn(),
  persistDomainEvent: vi.fn(),
  publishPersistedDomainEvents: vi.fn(),
  emitWebhookEvent: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: { select: mocks.select, update: mocks.update, transaction: mocks.transaction },
  applications: {},
  activityEvents: {},
  documentAssociations: {},
  documents: {},
  emailOutbox: {},
  nativeSignatureOtpChallenges: {},
  signatureEnvelopes: {},
  signatureEvents: {},
  signatureRecipients: {},
  signatureArtifacts: {},
  offers: {},
  workspaceSettings: {},
}));
vi.mock("@/lib/storage", () => ({
  storage: { read: vi.fn(async () => Buffer.from("%PDF")) },
}));
vi.mock("./bake", () => ({
  assertNativeSignablePdf: vi.fn(async () => 1),
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  gt: vi.fn(),
  isNotNull: vi.fn(),
  isNull: vi.fn(),
  lt: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}));
vi.mock("@/lib/public-origin", () => ({
  getHarlyPublicOrigin: () => "https://app.example.test",
}));
vi.mock("@/lib/crypto", () => ({ encryptSecret: mocks.encryptSecret }));
vi.mock("@/lib/email/outbox-processor", () => ({
  enqueueEmailOutbox: vi.fn(),
  processEmailOutbox: mocks.processEmailOutbox,
}));
vi.mock("@/lib/esign/maintenance", () => ({
  purgeExpiredSignatureData: vi.fn(),
}));
vi.mock("@/lib/esign/otp-policy", () => ({
  nextOtpAttempt: vi.fn(),
}));
vi.mock("@/server/events/emit", () => ({
  persistDomainEvent: mocks.persistDomainEvent,
  publishPersistedDomainEvents: mocks.publishPersistedDomainEvents,
}));
vi.mock("@/server/webhooks/emit", () => ({ emitWebhookEvent: mocks.emitWebhookEvent }));

import { createNativeSigningLink, rotateNativePortalSigningLink } from "./remote";

function query(value: unknown) {
  const builder = new Proxy(function () {}, {
    get(_target, property) {
      if (property === "then") {
        return (resolve: (result: unknown) => void) => resolve(value);
      }
      return () => builder;
    },
    apply() {
      return builder;
    },
  });
  return builder;
}

describe("rotateNativePortalSigningLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.encryptSecret.mockReturnValue({ ciphertext: "ciphertext", iv: "iv", tag: "tag" });
    mocks.persistDomainEvent.mockResolvedValue({ eventId: "event-1", eventName: "document.signature_sent" });
  });

  it("issues a fresh capability without exposing the stored token", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    mocks.select.mockReturnValue(query([{
      envelopeId: "envelope-1",
      envelopeStatus: "sent",
      documentStatus: "active",
      signatureStatus: "pending",
      currentExpiry: expiresAt,
    }]));
    mocks.update.mockReturnValue(query([{ id: "recipient-1" }]));

    const result = await rotateNativePortalSigningLink({
      workspaceId: "workspace-1",
      recipientId: "recipient-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.signingUrl).toMatch(/^https:\/\/app\.example\.test\/sign\/[A-Za-z0-9_-]{43}$/);
    expect(result.expiresAt).toBe(expiresAt);
    const setValues = mocks.update.mock.results[0]?.value;
    expect(setValues).toBeDefined();
  });

  it("refuses completed or expired requests", async () => {
    mocks.select.mockReturnValue(query([{
      envelopeId: "envelope-1",
      envelopeStatus: "completed",
      documentStatus: "active",
      signatureStatus: "signed",
      currentExpiry: new Date(Date.now() - 60_000),
    }]));

    await expect(rotateNativePortalSigningLink({
      workspaceId: "workspace-1",
      recipientId: "recipient-1",
    })).resolves.toEqual({
      ok: false,
      error: "This document is no longer waiting for your signature.",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rotates and queues at most one reminder when the recipient is overdue", async () => {
    const now = new Date("2026-09-09T12:00:00.000Z");
    const expiresAt = new Date("2026-10-09T12:00:00.000Z");
    const tx = {
      insert: vi.fn(),
      update: vi.fn(),
    };
    mocks.select.mockReturnValue(query([{
      workspaceId: "workspace-1",
      recipientId: "recipient-1",
      envelopeId: "envelope-1",
      documentName: "Offer.pdf",
      recipientEmail: "ada@example.test",
      recipientName: "Ada Lovelace",
      linkExpiresAt: expiresAt,
      envelopeSentAt: new Date("2026-09-07T12:00:00.000Z"),
    }]));
    tx.insert
      .mockReturnValueOnce(query([{ id: "reminder-event-1" }]))
      .mockReturnValueOnce(query([{ id: "outbox-1" }]));
    tx.update.mockReturnValue(query([{ id: "recipient-1" }]));
    mocks.transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));

    const { sendNativeSignatureReminders } = await import("./remote");
    await expect(sendNativeSignatureReminders({ workspaceId: "workspace-1", now })).resolves.toEqual({
      sent: 1,
      skipped: 0,
    });
    expect(tx.update).toHaveBeenCalled();
    expect(tx.insert).toHaveBeenCalledTimes(2);
    expect(mocks.processEmailOutbox).toHaveBeenCalledWith({ ids: ["outbox-1"], workspaceId: "workspace-1" });
  });

  it("does not rotate or queue when the daily idempotency event already exists", async () => {
    const tx = {
      insert: vi.fn().mockReturnValue(query([])),
      update: vi.fn(),
    };
    mocks.select.mockReturnValue(query([{
      workspaceId: "workspace-1",
      recipientId: "recipient-1",
      envelopeId: "envelope-1",
      documentName: "Offer.pdf",
      recipientEmail: "ada@example.test",
      recipientName: "Ada Lovelace",
      linkExpiresAt: new Date("2026-10-09T12:00:00.000Z"),
      envelopeSentAt: new Date("2026-09-07T12:00:00.000Z"),
    }]));
    mocks.transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));

    const { sendNativeSignatureReminders } = await import("./remote");
    await expect(sendNativeSignatureReminders({ workspaceId: "workspace-1", now: new Date("2026-09-09T12:00:00.000Z") })).resolves.toEqual({
      sent: 0,
      skipped: 1,
    });
    expect(tx.update).not.toHaveBeenCalled();
    expect(mocks.processEmailOutbox).not.toHaveBeenCalled();
  });
});

describe("createNativeSigningLink database boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.encryptSecret.mockReturnValue({ ciphertext: "ciphertext", iv: "iv", tag: "tag" });
    mocks.persistDomainEvent.mockResolvedValue({ eventId: "event-1", eventName: "document.signature_sent" });
  });

  it("uses the runtime database for both the envelope transaction and outbox delivery", async () => {
    mocks.select
      .mockReturnValueOnce(query([{ enabled: true, expirationDays: 30, securityMode: "link_only" }]))
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([{ id: "document-1", name: "Offer.pdf", storageKey: "documents/offer.pdf", mimeType: "application/pdf", status: "active", signatureStatus: "unsigned", fieldsSnapshot: [{ id: "field-1", type: "signature", page: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.05, required: true, recipientIndex: 0 }] }]));

    let insertCall = 0;
    const tx = {
      select: vi.fn(() => query([])),
      insert: vi.fn(() => ({
        values: () => {
          insertCall += 1;
          const result = insertCall === 1
            ? [{ id: "envelope-1" }]
            : insertCall === 2
              ? [{ id: "recipient-1", routingOrder: 1 }]
            : insertCall === 5
                ? [{ id: "outbox-1" }]
                : [];
          const write = query(result);
          (write as unknown as { returning: () => unknown }).returning = () => query(result);
          return write;
        },
      })),
      update: vi.fn(() => ({
        set: () => ({ where: () => query([]) }),
      })),
    };
    const isolatedDatabase = {
      select: mocks.select,
      transaction: vi.fn((callback: (value: typeof tx) => unknown) => callback(tx)),
    } as unknown as typeof import("@harly/db").db;
    mocks.processEmailOutbox.mockResolvedValue({ processed: 1, sent: 1, failed: 0 });

    const result = await createNativeSigningLink({
      database: isolatedDatabase,
      workspaceId: "workspace-1",
      documentId: "document-1",
      actorId: "user-1",
      recipientEmail: "ada@example.test",
      recipientName: "Ada Lovelace",
      effectKey: "run-1:node-sign:effect",
    });

    expect(result.ok).toBe(true);
    expect(isolatedDatabase.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.processEmailOutbox).toHaveBeenCalledWith({
      ids: ["outbox-1"],
      workspaceId: "workspace-1",
      database: isolatedDatabase,
    });
    expect(mocks.persistDomainEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: "document.signature_sent", aggregateId: "document-1" }),
    );
    expect(mocks.publishPersistedDomainEvents).toHaveBeenCalledWith(
      [expect.objectContaining({ eventId: "event-1" })],
      isolatedDatabase,
    );
    expect(mocks.emitWebhookEvent).toHaveBeenCalledWith(
      "workspace-1",
      "document.signature_sent",
      expect.objectContaining({ document: { id: "document-1" } }),
      expect.objectContaining({ skipDomainEvent: true, eventId: "event-1", database: isolatedDatabase }),
    );
  });
});
