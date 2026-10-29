import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@harly/db";

import {
  EMAIL_OUTBOX_THRESHOLDS,
  evaluateEmailOutboxHealth,
} from "@/lib/email/outbox-health-rules";

export type EmailOutboxHealth = {
  status: "ok" | "warning";
  failed: number;
  overduePending: number;
  stuckProcessing: number;
};

/** Readiness probes can be frequent; the counts only need to be roughly current. */
const HEALTH_CACHE_TTL_MS = 15_000;

let cached: { expiresAt: number; value: EmailOutboxHealth } | null = null;
let inFlight: Promise<EmailOutboxHealth> | null = null;

/**
 * Email outbox counts for the detail body only. Counts only, no recipients or
 * errors. Warnings never make readiness fail: a bad email must not take the app
 * out of rotation.
 *
 * This is INSTANCE-LEVEL, not workspace-scoped: it counts every workspace's rows
 * on this database. It must never be returned by a tenant-facing endpoint. The
 * readiness probe is the only caller and it returns just these counts.
 *
 * Successful results are cached in-process for 15 seconds, and concurrent
 * probes share one query. Failed lookups are not cached.
 */
export function getEmailOutboxHealth(): Promise<EmailOutboxHealth> {
  if (cached && Date.now() < cached.expiresAt) return Promise.resolve(cached.value);
  if (!inFlight) {
    inFlight = queryEmailOutboxHealth()
      .then((value) => {
        cached = { expiresAt: Date.now() + HEALTH_CACHE_TTL_MS, value };
        return value;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Test hook: forget the cached result. */
export function __resetEmailOutboxHealthCacheForTests(): void {
  cached = null;
  inFlight = null;
}

async function queryEmailOutboxHealth(): Promise<EmailOutboxHealth> {
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
