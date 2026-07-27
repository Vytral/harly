import { NextResponse } from "next/server";

import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { getIntegrationStatuses } from "@/features/workspaces/integrations-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Authenticated, secret-free integration health for dashboards and support tooling. */
export async function GET() {
  const context = await getWorkspaceContextOrNull();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const startedAt = performance.now();
  try {
    const statuses = await getIntegrationStatuses(context.organization.id);
    return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - startedAt), statuses }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, checkedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - startedAt), error: "Integration status unavailable." }, { status: 503 });
  }
}
