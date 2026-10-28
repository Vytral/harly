import { NextResponse } from "next/server";

import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { getIntegrationStatuses } from "@/features/workspaces/integrations-registry";
import { INTEGRATION_HEALTH_KEYS } from "@/features/integrations/health/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated, secret-free integration health for dashboards and support tooling.
 * `statuses` keeps the existing per-provider fields (each now also carries a
 * `health` map); `integrations` is the unified list with the same shape for every
 * health-tracked provider.
 */
export async function GET() {
  const context = await getWorkspaceContextOrNull();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const startedAt = performance.now();
  try {
    const statuses = await getIntegrationStatuses(context.organization.id);
    const integrations = INTEGRATION_HEALTH_KEYS.map((key) => statuses.health[key]);
    return NextResponse.json(
      {
        ok: true,
        checkedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - startedAt),
        statuses,
        integrations,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        checkedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - startedAt),
        error: "Integration status unavailable.",
      },
      { status: 503 },
    );
  }
}
