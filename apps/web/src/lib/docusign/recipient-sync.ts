import { db, signatureRecipients } from "@harly/db";

import {
  listEnvelopeRecipients,
  type EnvelopeRecipientItem,
} from "./client";

function toDateOrNull(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toRoutingOrder(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeStatus(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase();
  return normalized || "unknown";
}

function toRecipientRow(input: {
  workspaceId: string;
  envelopeId: string;
  recipient: EnvelopeRecipientItem;
}) {
  const { recipient } = input;
  if (!recipient.recipientId || !recipient.email || !recipient.name) return null;

  const status = normalizeStatus(recipient.status);
  return {
    workspaceId: input.workspaceId,
    envelopeId: input.envelopeId,
    providerRecipientId: recipient.recipientId,
    role: "signer",
    email: recipient.email,
    name: recipient.name,
    routingOrder: toRoutingOrder(recipient.routingOrder),
    clientUserId: recipient.clientUserId ?? null,
    status,
    signedAt: toDateOrNull(recipient.signedDateTime),
    declinedAt: toDateOrNull(recipient.declinedDateTime),
    declinedReason: recipient.declinedReason ?? null,
    updatedAt: new Date(),
  };
}

/**
 * Bring recipient state up to date after a missed or incomplete Connect event.
 * The provider recipient id is the stable conflict key, so this operation is
 * safe to repeat from both webhooks and the reconciliation worker.
 */
export async function syncEnvelopeRecipients(input: {
  workspaceId: string;
  signatureEnvelopeId: string;
  baseUrl: string;
  accessToken: string;
  accountId: string;
  providerEnvelopeId: string;
}): Promise<number> {
  const recipients = await listEnvelopeRecipients(
    input.baseUrl,
    input.accessToken,
    input.accountId,
    input.providerEnvelopeId,
  );
  const rows = recipients
    .map((recipient) =>
      toRecipientRow({
        workspaceId: input.workspaceId,
        envelopeId: input.signatureEnvelopeId,
        recipient,
      }),
    )
    .filter((row): row is NonNullable<typeof row> => row !== null);

  for (const recipient of rows) {
    const set = {
      email: recipient.email,
      name: recipient.name,
      routingOrder: recipient.routingOrder,
      clientUserId: recipient.clientUserId,
      status: recipient.status,
      declinedReason: recipient.declinedReason,
      updatedAt: new Date(),
      ...(recipient.signedAt ? { signedAt: recipient.signedAt } : {}),
      ...(recipient.declinedAt ? { declinedAt: recipient.declinedAt } : {}),
    };
    await db
      .insert(signatureRecipients)
      .values(recipient)
      .onConflictDoUpdate({
        target: [signatureRecipients.envelopeId, signatureRecipients.providerRecipientId],
        set,
      });
  }

  return rows.length;
}
