import { NextResponse, type NextRequest } from "next/server";

import { reconcileMailDeliveries } from "@/lib/mail/reconciliation";
import { authorizeCron } from "@/server/cron-auth";
import { startCronRun } from "@/server/cron-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "mail-reconciliation";

/** Reports unknown mail outcomes and normalizes stale sends safely. */
export async function POST(request: NextRequest) {
  const auth = await authorizeCron(request, CRON_KEY);
  if (!auth.ok) return auth.response;
  const run = startCronRun(CRON_KEY);
  try {
    const body = (await request.json().catch(() => ({}))) as {
      dryRun?: boolean;
      limit?: number;
      staleAfterMs?: number;
    };
    const result = await reconcileMailDeliveries(body);
    const counters = {
      inspected: result.inspected,
      staleSending: result.staleSending,
      unknown: result.unknown,
      normalized: result.normalized,
    };
    await run.finish("succeeded", counters);
    return NextResponse.json({ ok: true, ...counters, dryRun: result.dryRun, rows: result.rows });
  } catch (error) {
    await run.finish("failed");
    throw error;
  } finally {
    await auth.release();
  }
}
