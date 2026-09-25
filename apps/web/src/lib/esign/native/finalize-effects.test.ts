import { beforeEach, describe, expect, it, vi } from "vitest";

const effects = vi.hoisted(() => ({
  processEmailOutbox: vi.fn(),
  publishPersistedDomainEvents: vi.fn(),
  emitWebhookEvent: vi.fn(),
  resumeWorkflowDocumentWaits: vi.fn(),
}));

vi.mock("@/lib/email/outbox-processor", () => ({
  processEmailOutbox: effects.processEmailOutbox,
}));
vi.mock("@/server/events/emit", () => ({
  publishPersistedDomainEvents: effects.publishPersistedDomainEvents,
}));
vi.mock("@/server/webhooks/emit", () => ({
  emitWebhookEvent: effects.emitWebhookEvent,
}));
vi.mock("@/features/automations/runtime/worker", () => ({
  resumeWorkflowDocumentWaits: effects.resumeWorkflowDocumentWaits,
}));

import type { db } from "@harly/db";
import type { PersistedDomainEvent } from "@/server/events/emit";
import { finalizeNativeSignatureEffects } from "./finalize-effects";

const database = { name: "isolated-signing-database" } as unknown as typeof db;
const event = {
  eventId: "event-1",
  eventName: "document.signature_changed",
  workspaceId: "workspace-1",
  aggregateType: "document",
  aggregateId: "envelope-1",
  payload: {},
} as unknown as PersistedDomainEvent;
const hiredEvent = {
  ...event,
  eventId: "event-2",
  eventName: "application.hired",
  actorId: "recruiter-1",
  payload: { application: { id: "application-1" } },
} as unknown as PersistedDomainEvent;

describe("finalizeNativeSignatureEffects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delivers the next signer invitation through the signing transaction's database", async () => {
    await finalizeNativeSignatureEffects({
      database,
      workspaceId: "workspace-1",
      documentId: "document-1",
      envelopeId: "envelope-1",
      parentRunId: "run-1",
      actorId: "recruiter-1",
      complete: false,
      nextOutboxId: "outbox-2",
      documentTargetContext: { application: { id: "application-1" } },
      documentSignatureEvent: event,
      applicationHiredEvent: null,
    });

    expect(effects.processEmailOutbox).toHaveBeenCalledWith({
      ids: ["outbox-2"],
      workspaceId: "workspace-1",
      database,
    });
    expect(effects.publishPersistedDomainEvents).toHaveBeenCalledWith([event], database);
    expect(effects.emitWebhookEvent).toHaveBeenCalledWith(
      "workspace-1",
      "document.signature_changed",
      expect.objectContaining({
        document: { id: "document-1" },
        status: "pending",
        envelopeId: "envelope-1",
      }),
      expect.objectContaining({ eventId: "event-1", database }),
    );
    expect(effects.resumeWorkflowDocumentWaits).not.toHaveBeenCalled();
  });

  it("resumes document waits on that database only after the final signer", async () => {
    await finalizeNativeSignatureEffects({
      database,
      workspaceId: "workspace-1",
      documentId: "document-1",
      envelopeId: "envelope-1",
      parentRunId: "run-1",
      actorId: null,
      complete: true,
      nextOutboxId: null,
      documentTargetContext: {},
      documentSignatureEvent: event,
      applicationHiredEvent: null,
    });

    expect(effects.processEmailOutbox).not.toHaveBeenCalled();
    expect(effects.resumeWorkflowDocumentWaits).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", resourceId: "document-1" },
      database,
    );
    expect(effects.publishPersistedDomainEvents.mock.invocationCallOrder[0])
      .toBeLessThan(effects.emitWebhookEvent.mock.invocationCallOrder[0]!);
    expect(effects.emitWebhookEvent.mock.invocationCallOrder[0])
      .toBeLessThan(effects.resumeWorkflowDocumentWaits.mock.invocationCallOrder[0]!);
  });

  it("continues independent follow-ups when one post-commit delivery fails", async () => {
    effects.processEmailOutbox.mockRejectedValueOnce(new Error("mail transport is down"));

    await expect(finalizeNativeSignatureEffects({
      database,
      workspaceId: "workspace-1",
      documentId: "document-1",
      envelopeId: "envelope-1",
      parentRunId: "run-1",
      actorId: null,
      complete: true,
      nextOutboxId: "outbox-2",
      documentTargetContext: {},
      documentSignatureEvent: event,
      applicationHiredEvent: hiredEvent,
    })).resolves.toBeUndefined();

    expect(effects.publishPersistedDomainEvents).toHaveBeenCalledWith([event, hiredEvent], database);
    expect(effects.emitWebhookEvent).toHaveBeenCalledWith(
      "workspace-1",
      "document.signature_changed",
      expect.any(Object),
      expect.objectContaining({ parentRunId: "run-1", database }),
    );
    expect(effects.emitWebhookEvent).toHaveBeenNthCalledWith(
      2,
      "workspace-1",
      "application.hired",
      hiredEvent.payload,
      expect.objectContaining({ eventId: "event-2", parentRunId: "run-1", database }),
    );
    expect(effects.resumeWorkflowDocumentWaits).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", resourceId: "document-1" },
      database,
    );
  });
});
