import { NextResponse, type NextRequest } from "next/server";

import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { getAdvancedHiringAnalytics } from "@/features/reports/advanced";
import { getWorkspaceTimeZone } from "@/features/reports/canonical";
import { resolveWindow } from "@/features/reports/window";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const context = await getWorkspaceContextOrNull();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await requirePermission("reports:read");
  const raw = Number(request.nextUrl.searchParams.get("days") ?? 90);
  const days = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 730) : 90;
  const workspaceId = context.organization.id;
  const timeZone = await getWorkspaceTimeZone(workspaceId);
  const window = resolveWindow(days, timeZone, new Date());
  const data = await getAdvancedHiringAnalytics({ workspaceId, window });
  return NextResponse.json({ data });
}
