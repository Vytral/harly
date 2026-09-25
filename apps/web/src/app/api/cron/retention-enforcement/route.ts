import { NextResponse, type NextRequest } from "next/server";

import {
  anonymizeCandidateForRetention,
  findDueCandidatesForRetention,
} from "@/features/candidates/retention";
import { authorizeCron } from "@/server/cron-auth";
import { pruneDomainEventOutbox } from "@/server/events/outbox";
import { db } from "@harly/db";
import { sql } from "drizzle-orm";
import { startCronRun } from "@/server/cron-runs";
import { purgeExpiredSignatureDataGlobally } from "@/lib/esign/maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "retention-enforcement";
const BATCH_SIZE = 25;

export async function POST(request: NextRequest) {
  const auth = await authorizeCron(request, CRON_KEY);
  if (!auth.ok) return auth.response;
  const run = startCronRun(CRON_KEY);
  try {
    const domainEventsPruned = await pruneDomainEventOutbox();
    const auditLogsPruned = await pruneExpiredAuditLogs();
    const signatureDataPruned = await purgeExpiredSignatureDataGlobally();
    const due = await findDueCandidatesForRetention(BATCH_SIZE);
    let anonymized = 0;
    let skipped = 0;
    let failed = 0;
    for (const candidate of due) {
      const outcome = await anonymizeCandidateForRetention(
        candidate.id,
        candidate.workspaceId,
        candidate.thresholdMonths,
      );
      if (outcome === "anonymized") anonymized += 1;
      else if (outcome === "failed") failed += 1;
      else skipped += 1;
    }
    const counters = {
      due: due.length,
      anonymized,
      skipped,
      failed,
      domainEventsPruned,
      auditLogsPruned,
      signatureDataPruned,
    };
    await run.finish("succeeded", counters);
    return NextResponse.json({ ok: true, ...counters });
  } catch (error) {
    await run.finish("failed");
    throw error;
  } finally {
    await auth.release();
  }
}

async function pruneExpiredAuditLogs() {
  // Never delete the most recent 12 months, even if a bad setting reaches the
  // database. Critical entries are retained for the configured window too;
  // they are compliance evidence, not operational noise.
  const result = await db.execute(sql`
    delete from "audit_logs" a
    using "workspace_settings" s
    where a."workspace_id" = s."organization_id"
      and a."created_at" < now() - (greatest(s."audit_log_retention_months", 12)::text || ' months')::interval
    returning a."id"
  `);
  return result.length;
}
