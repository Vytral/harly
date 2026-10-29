import { NextResponse, type NextRequest } from "next/server";

import { isUnrestrictedScope } from "@/features/search/scope";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { getRolePolicy, requirePermission } from "@/features/workspaces/permissions-server";
import { getAdvancedHiringAnalytics } from "@/features/reports/advanced";
import { getWorkspaceTimeZone } from "@/features/reports/canonical";
import { resolveWindow } from "@/features/reports/window";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const context = await getWorkspaceContextOrNull();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const granted = await requirePermission("reports:read");
  const policy = await getRolePolicy(granted.organization.id, granted.roleKey);
  if (!isUnrestrictedScope(policy.scope)) {
    return NextResponse.json(
      { error: "Reports are not available for roles limited to specific jobs." },
      { status: 403 },
    );
  }
  const raw = Number(request.nextUrl.searchParams.get("days") ?? 90);
  const days = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 730) : 90;
  const workspaceId = context.organization.id;
  const timeZone = await getWorkspaceTimeZone(workspaceId);
  const window = resolveWindow(days, timeZone, new Date());
  const data = await getAdvancedHiringAnalytics({ workspaceId, window, actor: { scope: policy.scope } });
  return NextResponse.json({ data });
}
