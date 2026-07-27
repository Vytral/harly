import { NextResponse, type NextRequest } from "next/server";

import { authorizeCron } from "@/server/cron-auth";
import { startCronRun } from "@/server/cron-runs";
import { runDueScheduledReports } from "@/server/reports/scheduled";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await authorizeCron(request, "scheduled-reports");
  if (!auth.ok) return auth.response;
  const run = startCronRun("scheduled-reports");
  try {
    const result = await runDueScheduledReports();
    await run.finish(result.failed > 0 ? "failed" : "succeeded", result);
    return NextResponse.json({ ok: result.failed === 0, ...result });
  } catch (error) {
    await run.finish("failed");
    throw error;
  } finally {
    await auth.release();
  }
}
