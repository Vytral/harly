import "server-only";

import { and, eq, lt, or } from "drizzle-orm";

import { db, mailIdempotencyKeys } from "@harly/db";

const DEFAULT_LIMIT = 100;
const DEFAULT_STALE_AFTER_MS = 15 * 60_000;

export type MailReconciliationRow = {
  id: string;
  workspaceId: string;
  status: "sending" | "unknown";
  idempotencyKey: string;
  messageId: string;
  threadId: string | null;
  mailMessageId: string | null;
  providerMessageId: string | null;
  updatedAt: Date;
  error: string | null;
};

export type MailReconciliationResult = {
  dryRun: boolean;
  inspected: number;
  staleSending: number;
  unknown: number;
  normalized: number;
  rows: MailReconciliationRow[];
};

function isReconciliationRow(row: {
  id: string;
  workspaceId: string;
  status: string;
  idempotencyKey: string;
  messageId: string;
  threadId: string | null;
  mailMessageId: string | null;
  providerMessageId: string | null;
  updatedAt: Date;
  error: string | null;
}): row is MailReconciliationRow {
  return row.status === "sending" || row.status === "unknown";
}

function boundedLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(500, Math.max(1, Math.floor(value!)));
}

/**
 * Find delivery reservations that cannot safely be retried automatically.
 * A stale `sending` row is moved to `unknown`, never resent: SMTP/IMAP can
 * accept a message before the process loses its response. Operators must
 * reconcile the provider outcome before marking it sent or retryable.
 */
export async function reconcileMailDeliveries(input?: {
  dryRun?: boolean;
  limit?: number;
  staleAfterMs?: number;
}): Promise<MailReconciliationResult> {
  const dryRun = input?.dryRun !== false;
  const limit = boundedLimit(input?.limit);
  const staleAfterMs = Math.max(
    60_000,
    Number.isFinite(input?.staleAfterMs)
      ? Math.floor(input!.staleAfterMs!)
      : DEFAULT_STALE_AFTER_MS,
  );
  const cutoff = new Date(Date.now() - staleAfterMs);

  const rows = await db
    .select({
      id: mailIdempotencyKeys.id,
      workspaceId: mailIdempotencyKeys.workspaceId,
      status: mailIdempotencyKeys.status,
      idempotencyKey: mailIdempotencyKeys.idempotencyKey,
      messageId: mailIdempotencyKeys.messageId,
      threadId: mailIdempotencyKeys.threadId,
      mailMessageId: mailIdempotencyKeys.mailMessageId,
      providerMessageId: mailIdempotencyKeys.providerMessageId,
      updatedAt: mailIdempotencyKeys.updatedAt,
      error: mailIdempotencyKeys.error,
    })
    .from(mailIdempotencyKeys)
    .where(
      or(
        eq(mailIdempotencyKeys.status, "unknown"),
        and(
          eq(mailIdempotencyKeys.status, "sending"),
          lt(mailIdempotencyKeys.updatedAt, cutoff),
        ),
      ),
    )
    .orderBy(mailIdempotencyKeys.updatedAt)
    .limit(limit);

  const reconciliationRows = rows.filter(isReconciliationRow);
  const staleSending = reconciliationRows.filter(
    (row) => row.status === "sending",
  ).length;
  const unknown = reconciliationRows.filter(
    (row) => row.status === "unknown",
  ).length;
  let normalized = 0;

  if (!dryRun) {
    for (const row of reconciliationRows) {
      if (row.status !== "sending") continue;
      const [updated] = await db
        .update(mailIdempotencyKeys)
        .set({
          status: "unknown",
          error:
            row.error ??
            "Delivery timed out before the provider outcome was confirmed; operator reconciliation required.",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(mailIdempotencyKeys.id, row.id),
            eq(mailIdempotencyKeys.status, "sending"),
            lt(mailIdempotencyKeys.updatedAt, cutoff),
          ),
        )
        .returning({ id: mailIdempotencyKeys.id });
      if (updated) normalized += 1;
    }
  }

  return {
    dryRun,
    inspected: rows.length,
    staleSending,
    unknown,
    normalized,
    rows: reconciliationRows,
  };
}
