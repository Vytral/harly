import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";

import { db, mailIdempotencyKeys } from "@harly/db";

/**
 * `unknown` means an earlier attempt may have reached the provider; the key is
 * never re-sent automatically. `in_progress` means another request owns it.
 * Neither throws, so callers can return a typed result to the composer.
 */
export type MailDeliveryReservation =
  | { kind: "replay"; messageId: string; threadId: string | null; providerMessageId: string | null }
  | { kind: "reserved"; id: string; messageId: string }
  | { kind: "unknown"; id: string; messageId: string }
  | { kind: "in_progress" };

export async function reserveLegacyMailDelivery(input: {
  workspaceId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  candidateId?: string | null;
  applicationId?: string | null;
  threadId?: string | null;
}): Promise<MailDeliveryReservation> {
  const payloadHash = createHash("sha256").update(JSON.stringify(input.payload)).digest("hex");
  const messageId = `<${randomUUID()}@harly.local>`;
  const [created] = await db.insert(mailIdempotencyKeys).values({
    workspaceId: input.workspaceId,
    idempotencyKey: input.idempotencyKey,
    messageId,
    payloadHash,
    candidateId: input.candidateId ?? null,
    applicationId: input.applicationId ?? null,
    threadId: input.threadId ?? null,
    status: "pending",
  }).onConflictDoNothing({
    target: [mailIdempotencyKeys.workspaceId, mailIdempotencyKeys.idempotencyKey],
  }).returning({ id: mailIdempotencyKeys.id, messageId: mailIdempotencyKeys.messageId });

  if (!created) {
    const [existing] = await db.select().from(mailIdempotencyKeys).where(and(
      eq(mailIdempotencyKeys.workspaceId, input.workspaceId),
      eq(mailIdempotencyKeys.idempotencyKey, input.idempotencyKey),
    )).limit(1);
    if (!existing) throw new Error("Mail delivery reservation was not found.");
    if (existing.payloadHash !== payloadHash) throw new Error("Idempotency key was reused with a different email.");
    if (existing.status === "sent") return { kind: "replay", messageId: existing.messageId, threadId: existing.threadId, providerMessageId: existing.providerMessageId };
    if (existing.status === "unknown") return { kind: "unknown", id: existing.id, messageId: existing.messageId };
    if (existing.status === "sending") return { kind: "in_progress" };
    const [claimed] = await db.update(mailIdempotencyKeys).set({ status: "sending", updatedAt: new Date() }).where(and(
      eq(mailIdempotencyKeys.id, existing.id),
      or(eq(mailIdempotencyKeys.status, "pending"), eq(mailIdempotencyKeys.status, "failed")),
    )).returning({ id: mailIdempotencyKeys.id, messageId: mailIdempotencyKeys.messageId });
    if (!claimed) return { kind: "in_progress" };
    return { kind: "reserved", ...claimed };
  }

  const [claimed] = await db.update(mailIdempotencyKeys).set({ status: "sending", updatedAt: new Date() }).where(and(
    eq(mailIdempotencyKeys.id, created.id),
    eq(mailIdempotencyKeys.status, "pending"),
  )).returning({ id: mailIdempotencyKeys.id, messageId: mailIdempotencyKeys.messageId });
  if (!claimed) return { kind: "in_progress" };
  return { kind: "reserved", ...claimed };
}

export async function completeLegacyMailDelivery(input: { id: string; threadId: string; mailMessageId: string; providerMessageId?: string | null }) {
  await db.update(mailIdempotencyKeys).set({ status: "sent", threadId: input.threadId, mailMessageId: input.mailMessageId, providerMessageId: input.providerMessageId ?? null, error: null, updatedAt: new Date() }).where(and(
    eq(mailIdempotencyKeys.id, input.id),
    eq(mailIdempotencyKeys.status, "sending"),
  ));
}

/**
 * Confirm that an `unknown` delivery was in fact sent (for example, it is in
 * the sent folder). Moves only `unknown` rows, so `sent`, `sending` and
 * `failed` keys cannot be changed by this call.
 */
export async function resolveUnknownMailDelivery(input: {
  workspaceId: string;
  idempotencyKey: string;
}): Promise<boolean> {
  const rows = await db.update(mailIdempotencyKeys).set({
    status: "sent",
    error: null,
    updatedAt: new Date(),
  }).where(and(
    eq(mailIdempotencyKeys.workspaceId, input.workspaceId),
    eq(mailIdempotencyKeys.idempotencyKey, input.idempotencyKey),
    eq(mailIdempotencyKeys.status, "unknown"),
  )).returning({ id: mailIdempotencyKeys.id });
  return rows.length > 0;
}

export async function failLegacyMailDelivery(id: string, error: unknown) {
  await db.update(mailIdempotencyKeys).set({ status: "unknown", error: error instanceof Error ? error.message.slice(0, 1000) : "Mail delivery failed", updatedAt: new Date() }).where(and(
    eq(mailIdempotencyKeys.id, id),
    eq(mailIdempotencyKeys.status, "sending"),
  ));
}
