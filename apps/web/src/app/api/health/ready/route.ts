import { NextResponse } from "next/server";

import { getServerLogger } from "@/lib/logger";
import { harlyVersion, isReady } from "@/lib/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (await isReady()) {
      return NextResponse.json({ status: "ok", version: harlyVersion });
    }
  } catch (error) {
    getServerLogger().error(error, "readiness check failed");
  }
  return NextResponse.json(
    { status: "unavailable", version: harlyVersion },
    { status: 503 },
  );
}
