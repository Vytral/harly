import { NextResponse } from "next/server";

import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { getIntegrationStatuses } from "@/features/workspaces/integrations-registry";
import { INTEGRATION_HEALTH_KEYS } from "@/features/integrations/health/model";
import { buildIntegrationHealthResponse } from "@/features/integrations/health/response";
import { can } from "@/features/workspaces/permissions-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated integration health for dashboards and support tooling.
 *
 * Members without `integrations:manage` receive only coarse per-integration
 * states. Managers also get the per-provider `statuses` (each carrying a
 * `health` map) with every secret removed; `integrations` is the unified list
 * with the same shape for every health-tracked provider.
 */
export async function GET() {
  const context = await getWorkspaceContextOrNull();
  if (!context) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const startedAt = performance.now();
  try {
    const [statuses, canManage] = await Promise.all([
      getIntegrationStatuses(context.organization.id),
      can("integrations:manage"),
    ]);
    const integrations = INTEGRATION_HEALTH_KEYS.map((key) => statuses.health[key]);
    return NextResponse.json(
      {
        ok: true,
        checkedAt: new Date().toISOString(),
        durationMs: Math.round(performance.now() - startedAt),
        ...buildIntegrationHealthResponse({
          canManage,
          statuses: statuses as unknown as Record<string, unknown>,
          integrations,
        }),
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
