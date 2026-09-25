import "server-only";

import { db } from "@harly/db";

import { processEmailOutbox } from "@/lib/email/outbox-processor";
import { createLogger } from "@/lib/logger";
import type { PersistedDomainEvent } from "@/server/events/emit";
import { publishPersistedDomainEvents } from "@/server/events/emit";
import { resumeWorkflowDocumentWaits } from "@/features/automations/runtime/worker";

const log = createLogger("native-finalize-effects");

/**
 * Deliver the effects that follow the committed signature transaction.
 * Keep every durable follow-up on the same database seam as the signing
 * transaction so isolated workers and retries cannot silently cross clients.
 */
export async function finalizeNativeSignatureEffects(input: {
  database: typeof db;
  workspaceId: string;
  documentId: string;
  envelopeId: string;
  parentRunId: string | null;
  actorId: string | null;
  complete: boolean;
  nextOutboxId: string | null;
  documentTargetContext: Record<string, unknown>;
  documentSignatureEvent: PersistedDomainEvent;
  applicationHiredEvent: PersistedDomainEvent | null;
}) {
  const deliver = async (effect: string, operation: () => Promise<unknown>) => {
    try {
      await operation();
    } catch (error) {
      // The signature transaction has already committed. Keep the remaining
      // independent effects running; durable outboxes and the document-expiry
      // reconciler are the retry path for these best-effort wakeups.
      log.error({ error, effect, workspaceId: input.workspaceId, documentId: input.documentId, envelopeId: input.envelopeId }, "native signature follow-up failed after commit");
    }
  };

  if (input.nextOutboxId) {
    await deliver("next_signer_email", () => processEmailOutbox({
      ids: [input.nextOutboxId!],
      workspaceId: input.workspaceId,
      database: input.database,
    }));
  }

  const persistedEvents = [
    input.documentSignatureEvent,
    ...(input.applicationHiredEvent ? [input.applicationHiredEvent] : []),
  ];
  await deliver("publish_domain_events", () => publishPersistedDomainEvents(persistedEvents, input.database));

  await deliver("webhook_event", async () => {
    const { emitWebhookEvent } = await import("@/server/webhooks/emit");
    await emitWebhookEvent(
      input.workspaceId,
      "document.signature_changed",
      {
        document: { id: input.documentId },
        ...input.documentTargetContext,
        status: input.complete ? "signed" : "pending",
        provider: "native",
        envelopeId: input.envelopeId,
      },
      {
        actorId: input.actorId ?? undefined,
        skipDomainEvent: true,
        eventId: input.documentSignatureEvent.eventId,
        parentRunId: input.parentRunId ?? undefined,
        database: input.database,
      },
    );
  });

  if (input.applicationHiredEvent) {
    await deliver("application_hired_webhook", async () => {
      const { emitWebhookEvent } = await import("@/server/webhooks/emit");
      await emitWebhookEvent(
        input.workspaceId,
        "application.hired",
        input.applicationHiredEvent!.payload,
        {
          actorId: input.applicationHiredEvent!.actorId,
          skipDomainEvent: true,
          eventId: input.applicationHiredEvent!.eventId,
          parentRunId: input.parentRunId ?? undefined,
          database: input.database,
        },
      );
    });
  }

  if (input.complete) {
    await deliver("resume_document_waits", () => resumeWorkflowDocumentWaits(
        { workspaceId: input.workspaceId, resourceId: input.documentId },
        input.database,
      ));
  }
}
