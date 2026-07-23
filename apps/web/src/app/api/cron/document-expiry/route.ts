import { NextResponse, type NextRequest } from "next/server";

import { expireOverdueDocuments } from "@/features/documents/expiry";
import { authorizeCron } from "@/server/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_KEY = "document-expiry";

export async function POST(request: NextRequest) {
  const auth = await authorizeCron(request, CRON_KEY);
  if (!auth.ok) return auth.response;
  try {
    const result = await expireOverdueDocuments();
    return NextResponse.json({ ok: true, ...result });
  } finally {
    await auth.release();
  }
}
