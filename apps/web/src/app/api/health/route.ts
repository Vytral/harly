import { NextResponse } from "next/server";

import { getServerLogger } from "@/lib/logger";
import { harlyVersion, isReady } from "@/lib/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Backwards-compatible alias of /api/health/ready. */
export async function GET() {
  try {
    if (await isReady()) {
      return NextResponse.json({ status: "ok", version: harlyVersion });
    }
  } catch (error) {
    // Preserve the original hardening: never expose DB details publicly.
    getServerLogger().error(error, "health check failed");
  }
  return NextResponse.json(
    { status: "unavailable", version: harlyVersion },
    { status: 503 },
  );
}
