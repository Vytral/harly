import { NextResponse, type NextRequest } from "next/server";

import { isUnrestrictedScope } from "@/features/search/scope";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { getRolePolicy, requirePermission } from "@/features/workspaces/permissions-server";
import { getAdvancedHiringAnalytics } from "@/features/reports/advanced";
import { getWorkspaceTimeZone } from "@/features/reports/canonical";
import { REPORT_RANGE_DAYS, type ReportRangeDays } from "@/features/reports/ranges";
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
  // The same ranges the Reports page offers (30, 90 or 365 days); 90 by default.
  const rawDays = request.nextUrl.searchParams.get("days");
  const days = rawDays === null ? 90 : Number(rawDays);
  if (!REPORT_RANGE_DAYS.includes(days as ReportRangeDays)) {
    return NextResponse.json(
      { error: `days must be one of ${REPORT_RANGE_DAYS.join(", ")}.` },
      { status: 400 },
    );
  }
  const workspaceId = context.organization.id;
  const timeZone = await getWorkspaceTimeZone(workspaceId);
  const window = resolveWindow(days, timeZone, new Date());
  const data = await getAdvancedHiringAnalytics({ workspaceId, window, actor: { scope: policy.scope } });
  return NextResponse.json({ data });
}
