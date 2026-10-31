import "server-only";

import { and, eq } from "drizzle-orm";

import {
  db,
  emailOutbox,
  signatureEnvelopes,
  signatureRecipients,
  user as authUser,
} from "@harly/db";

import { encryptSecret } from "@/lib/crypto";

import type { NativeNoticePayload } from "./notice-content";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

export const NATIVE_NOTICE_KIND = "native.signature.notice";

/** Who asked for the signature (null for workflow-created envelopes). */
export async function loadEnvelopeSender(executor: Executor, workspaceId: string, envelopeId: string) {
  const [row] = await executor
    .select({ id: authUser.id, name: authUser.name, email: authUser.email })
    .from(signatureEnvelopes)
    .innerJoin(authUser, eq(authUser.id, signatureEnvelopes.createdById))
    .where(and(eq(signatureEnvelopes.id, envelopeId), eq(signatureEnvelopes.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

export async function loadEnvelopeSigners(executor: Executor, workspaceId: string, envelopeId: string) {
  return executor
    .select({
      id: signatureRecipients.id,
      name: signatureRecipients.name,
      email: signatureRecipients.email,
      status: signatureRecipients.status,
      routingOrder: signatureRecipients.routingOrder,
      signedAt: signatureRecipients.signedAt,
    })
    .from(signatureRecipients)
    .where(and(
      eq(signatureRecipients.workspaceId, workspaceId),
      eq(signatureRecipients.envelopeId, envelopeId),
      eq(signatureRecipients.role, "signer"),
    ));
}

/**
 * Insert one durable notice. Returns the outbox id so the caller can attempt
 * immediate delivery after its transaction commits. A repeated call with the
 * same dedupe key is a no-op (returns null).
 */
export async function insertNativeNotice(
  executor: Executor,
  input: {
    workspaceId: string;
    envelopeId: string;
    recipientKey: string;
    actorId?: string | null;
    payload: NativeNoticePayload & { token?: unknown };
  },
): Promise<string | null> {
  const [row] = await executor
    .insert(emailOutbox)
    .values({
      workspaceId: input.workspaceId,
      kind: NATIVE_NOTICE_KIND,
      payload: input.payload,
      dedupeKey: `native-notice:${input.envelopeId}:${input.payload.event}:${input.recipientKey}`,
      actorId: input.actorId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: emailOutbox.id });
  return row?.id ?? null;
}

export type InvitationPayloadInput = {
  rawToken: string;
  recipientEmail: string;
  recipientName: string;
  documentName: string;
  subject?: string | null;
  message?: string | null;
  expiresAt: Date;
  senderName?: string | null;
  signerOrder: number;
  signerCount: number;
  reminder?: boolean;
  reminderNumber?: number;
};

/** Shape of `native.signature.invitation` outbox payloads (new + reminder). */
export function buildInvitationPayload(input: InvitationPayloadInput) {
  return {
    token: encryptSecret(input.rawToken),
    recipientEmail: input.recipientEmail,
    recipientName: input.recipientName,
    documentName: input.documentName,
    subject: input.subject ?? undefined,
    message: input.message?.trim() || undefined,
    expiresAt: input.expiresAt.toISOString(),
    senderName: input.senderName ?? undefined,
    signerOrder: input.signerOrder,
    signerCount: input.signerCount,
    reminder: input.reminder ?? false,
    reminderNumber: input.reminderNumber ?? 0,
  };
}
