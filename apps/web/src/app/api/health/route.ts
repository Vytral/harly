import { NextResponse } from "next/server";

import { sql } from "@harly/db";

import { getServerLogger } from "@/lib/logger";

export const runtime = "nodejs";

// Liveness/readiness probe for self-hosted deployments. Returns 200 only when
// the database is reachable so container orchestrators / load balancers can
// keep the instance out of rotation until it is actually ready.
export async function GET() {
  try {
    await sql`select 1`;
    return NextResponse.json(
      { status: "ok", time: new Date().toISOString() },
      { status: 200 },
    );
  } catch (error) {
    // Never leak internal DB details to unauthenticated probes; log server-side.
    getServerLogger().error(error, "health check failed");
    return NextResponse.json(
      { status: "unhealthy", error: "database unreachable" },
      { status: 503 },
    );
  }
}
