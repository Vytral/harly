import { NextResponse, type NextRequest } from "next/server";

import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { getAdvancedHiringAnalytics } from "@/features/reports/advanced";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const context = await getWorkspaceContextOrNull();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await requirePermission("reports:read");
  const raw = Number(request.nextUrl.searchParams.get("days") ?? 90);
  const days = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 1), 730) : 90;
  const data = await getAdvancedHiringAnalytics(context.organization.id, { since: new Date(Date.now() - days * 86_400_000) });
  return NextResponse.json({ data });
}
