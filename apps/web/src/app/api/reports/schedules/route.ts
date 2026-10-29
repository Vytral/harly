import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { isUnrestrictedScope } from "@/features/search/scope";
import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { getRolePolicy, requirePermission } from "@/features/workspaces/permissions-server";
import { createScheduledReport, listScheduledReports } from "@/server/reports/scheduled";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESTRICTED_SCOPE_MESSAGE = "Reports are not available for roles limited to specific jobs.";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  recipients: z.array(z.string().email()).min(1).max(50),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  reportType: z.enum(["hiring_overview", "advanced_hiring"]).default("hiring_overview"),
});

export async function GET() {
  const context = await getWorkspaceContextOrNull();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await requirePermission("reports:read");
  const policy = await getRolePolicy(context.organization.id, context.roleKey);
  // A schedule lists the report's recipients and status, so a job-limited role
  // does not see the workspace's schedules at all.
  if (!isUnrestrictedScope(policy.scope)) {
    return NextResponse.json({ error: RESTRICTED_SCOPE_MESSAGE }, { status: 403 });
  }
  const rows = await listScheduledReports(context.organization.id);
  return NextResponse.json({ data: rows.map((row) => ({ ...row, recipients: row.recipients })) });
}

export async function POST(request: NextRequest) {
  const context = await getWorkspaceContextOrNull();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await requirePermission("reports:read");
  if (context.roleKey !== "owner" && context.roleKey !== "admin") {
    return NextResponse.json(
      { error: "Only workspace owners and admins can manage scheduled reports." },
      { status: 403 },
    );
  }
  const policy = await getRolePolicy(context.organization.id, context.roleKey);
  if (!isUnrestrictedScope(policy.scope)) {
    return NextResponse.json({ error: RESTRICTED_SCOPE_MESSAGE }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid scheduled report." }, { status: 422 });
  const row = await createScheduledReport({ ...parsed.data, workspaceId: context.organization.id, createdById: context.user.id });
  return NextResponse.json({ data: row }, { status: 201 });
}
