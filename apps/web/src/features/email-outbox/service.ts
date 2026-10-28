import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db, emailOutbox } from "@harly/db";

import { processEmailOutbox } from "@/lib/email/outbox-processor";
import {
  canRetryOrCancel,
  kindLabelOf,
  recipientOf,
  statusesForFilter,
  summaryOf,
  type OutboxFilter,
} from "@/features/email-outbox/describe";

export const DELIVERY_LOG_PAGE_SIZE = 25;

export type DeliveryLogRow = {
  id: string;
  kind: string;
  kindLabel: string;
  recipient: string | null;
  summary: string;
  status: string;
  attempts: number;
  lastError: string | null;
  nextRetryAt: string | null;
  sentAt: string | null;
  createdAt: string;
  canRetry: boolean;
  canCancel: boolean;
};

export type DeliveryLogPage = {
  rows: DeliveryLogRow[];
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/** One page of the delivery log, newest first. Scoped to the workspace. */
export async function listDeliveryLog(input: {
  workspaceId: string;
  filter: OutboxFilter;
  page: number;
}): Promise<DeliveryLogPage> {
  const page = Math.max(1, Math.floor(input.page));
  const statuses = statusesForFilter(input.filter);
  const rows = await db
    .select({
      id: emailOutbox.id,
      kind: emailOutbox.kind,
      payload: emailOutbox.payload,
      status: emailOutbox.status,
      attempts: emailOutbox.attempts,
      lastError: emailOutbox.lastError,
      nextRetryAt: emailOutbox.nextRetryAt,
      sentAt: emailOutbox.sentAt,
      createdAt: emailOutbox.createdAt,
      providerMessageId: emailOutbox.providerMessageId,
    })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.workspaceId, input.workspaceId),
        statuses ? inArray(emailOutbox.status, statuses) : undefined,
      ),
    )
    .orderBy(desc(emailOutbox.createdAt), desc(emailOutbox.id))
    .limit(DELIVERY_LOG_PAGE_SIZE + 1)
    .offset((page - 1) * DELIVERY_LOG_PAGE_SIZE);

  const hasNext = rows.length > DELIVERY_LOG_PAGE_SIZE;
  const visible = rows.slice(0, DELIVERY_LOG_PAGE_SIZE);
  return {
    page,
    hasPrevious: page > 1,
    hasNext,
    rows: visible.map((row) => {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const actionable = canRetryOrCancel({
        status: row.status,
        providerMessageId: row.providerMessageId,
        sentAt: row.sentAt,
      });
      return {
        id: row.id,
        kind: row.kind,
        kindLabel: kindLabelOf(row.kind),
        recipient: recipientOf(payload),
        summary: summaryOf(row.kind, payload),
        status: row.status,
        attempts: row.attempts,
        lastError: row.lastError,
        nextRetryAt: iso(row.nextRetryAt),
        sentAt: iso(row.sentAt),
        createdAt: row.createdAt.toISOString(),
        canRetry: actionable,
        canCancel: actionable,
      };
    }),
  };
}

/**
 * Re-queue one failed or pending row and try it immediately. Only rows the
 * provider has not accepted can be retried; the stored key is reused, so a
 * retry cannot send a second copy of an accepted message.
 */
export async function retryDelivery(input: {
  workspaceId: string;
  id: string;
}): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const [queued] = await db
    .update(emailOutbox)
    .set({
      status: "pending",
      attempts: 0,
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
    })
    .where(
      and(
        eq(emailOutbox.id, input.id),
        eq(emailOutbox.workspaceId, input.workspaceId),
        inArray(emailOutbox.status, ["failed", "pending"]),
        isNull(emailOutbox.providerMessageId),
        isNull(emailOutbox.sentAt),
      ),
    )
    .returning({ id: emailOutbox.id });
  if (!queued) {
    return { ok: false, error: "This email can no longer be retried." };
  }
  await processEmailOutbox({ ids: [queued.id], workspaceId: input.workspaceId });
  const [after] = await db
    .select({ status: emailOutbox.status })
    .from(emailOutbox)
    .where(eq(emailOutbox.id, queued.id))
    .limit(1);
  return { ok: true, status: after?.status ?? "pending" };
}

/** Stop a failed or pending row for good. It is never claimed or sent again. */
export async function cancelDelivery(input: {
  workspaceId: string;
  id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [cancelled] = await db
    .update(emailOutbox)
    .set({
      status: "cancelled",
      nextRetryAt: null,
      lockedAt: null,
      lockedBy: null,
    })
    .where(
      and(
        eq(emailOutbox.id, input.id),
        eq(emailOutbox.workspaceId, input.workspaceId),
        inArray(emailOutbox.status, ["failed", "pending"]),
        isNull(emailOutbox.providerMessageId),
        isNull(emailOutbox.sentAt),
      ),
    )
    .returning({ id: emailOutbox.id });
  if (!cancelled) {
    return { ok: false, error: "This email can no longer be cancelled." };
  }
  return { ok: true };
}
