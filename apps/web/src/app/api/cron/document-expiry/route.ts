import { NextResponse, type NextRequest } from "next/server";

import { expireOverdueDocuments } from "@/features/documents/expiry";
import { authorizeCron } from "@/server/cron-auth";
import { startCronRun } from "@/server/cron-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "document-expiry";

export async function POST(request: NextRequest) {
  const auth = await authorizeCron(request, CRON_KEY);
  if (!auth.ok) return auth.response;
  const run = startCronRun(CRON_KEY);
  try {
    const result = await expireOverdueDocuments();
    await run.finish("succeeded", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    await run.finish("failed");
    throw error;
  } finally {
    await auth.release();
  }
}
