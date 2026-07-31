import { NextResponse } from "next/server";

import { AUTOMATIONS_DISABLED_MESSAGE } from "@/features/automations/status";

export const runtime = "nodejs";

function disabledResponse(..._args: unknown[]) {
  return NextResponse.json(
    { ok: false, error: AUTOMATIONS_DISABLED_MESSAGE },
    { status: 410 },
  );
}

export const GET = disabledResponse;
export const POST = disabledResponse;
