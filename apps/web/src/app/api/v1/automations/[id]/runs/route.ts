import { NextResponse } from "next/server";

import { AUTOMATIONS_DISABLED_MESSAGE } from "@/features/automations/status";

export const runtime = "nodejs";

/**
 * GET /api/v1/automations/:id/runs — execution history for a workflow.
 * Query params: `limit` (1-100, default 50) and opaque `cursor`.
 */
export const GET = (..._args: unknown[]) => {
  void _args;
  return NextResponse.json(
    { ok: false, error: AUTOMATIONS_DISABLED_MESSAGE },
    { status: 410 },
  );
};
