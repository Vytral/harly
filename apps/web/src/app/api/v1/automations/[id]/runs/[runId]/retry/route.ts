import { NextResponse } from "next/server";

import { AUTOMATIONS_API_GONE_MESSAGE } from "@/features/automations/status";

export const runtime = "nodejs";

export const POST = (..._args: unknown[]) => {
  void _args;
  return NextResponse.json(
    { ok: false, error: AUTOMATIONS_API_GONE_MESSAGE },
    { status: 410 },
  );
};
