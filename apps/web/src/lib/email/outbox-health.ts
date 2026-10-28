import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@harly/db";

import {
  EMAIL_OUTBOX_THRESHOLDS,
  evaluateEmailOutboxHealth,
} from "@/lib/email/outbox-health-rules";

/**
 * Email outbox health for readiness detail. Counts only, no recipients or
 * errors. Warnings never make readiness fail: a bad email must not take the
 * app out of rotation.
 */
export async function getEmailOutboxHealth(): Promise<{
  status: "ok" | "warning";
  failed: number;
  overduePending: number;
  stuckProcessing: number;
}> {
  const [row] = (await db.execute(sql`
    select
      (select count(*)::int from email_outbox where status = 'failed') as failed,
      (select count(*)::int from email_outbox
        where status = 'pending' and coalesce(next_retry_at, created_at) < now() - interval '15 minutes') as overdue,
      (select count(*)::int from email_outbox
        where status = 'processing' and locked_at < now() - interval '5 minutes') as stuck
  `)) as unknown as Array<{ failed: number; overdue: number; stuck: number }>;
  const counts = {
    failed: Number(row?.failed ?? 0),
    overduePending: Number(row?.overdue ?? 0),
    stuckProcessing: Number(row?.stuck ?? 0),
  };
  const health = evaluateEmailOutboxHealth(counts, EMAIL_OUTBOX_THRESHOLDS);
  return { status: health.warn ? "warning" : "ok", ...counts };
}
