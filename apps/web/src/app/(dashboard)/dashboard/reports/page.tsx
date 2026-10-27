import { getReportsData } from "@/features/reports/data";
import { normalizeReportRange } from "@/features/reports/ranges";
import { ReportsDashboard } from "@/features/reports/ReportsDashboard";
import { getRolePermissions, requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

type ReportsPageProps = {
  searchParams: Promise<{ range?: string }>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const context = await requirePagePermission("reports:read");
  const { range: rangeRaw } = await searchParams;
  const parsed = Number(rangeRaw);
  const rangeDays = normalizeReportRange(parsed);

  const [data, permissions] = await Promise.all([
    getReportsData(rangeDays),
    getRolePermissions(context.organization.id, context.roleKey),
  ]);

  return <ReportsDashboard data={data} canViewCandidates={permissions.includes("candidates:view")} canViewJobs={permissions.includes("jobs:view")} />;
}
