import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { createScheduledReport, listScheduledReports } from "@/server/reports/scheduled";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const rows = await listScheduledReports(context.organization.id);
  return NextResponse.json({ data: rows.map((row) => ({ ...row, recipients: row.recipients })) });
}

export async function POST(request: NextRequest) {
  const context = await getWorkspaceContextOrNull();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await requirePermission("reports:read");
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid scheduled report." }, { status: 422 });
  const row = await createScheduledReport({ ...parsed.data, workspaceId: context.organization.id, createdById: context.user.id });
  return NextResponse.json({ data: row }, { status: 201 });
}
