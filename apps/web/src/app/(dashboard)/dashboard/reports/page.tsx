import { ChartColumn } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { isUnrestrictedScope } from "@/features/search/scope";
import { getReportsData } from "@/features/reports/data";
import { normalizeReportRange } from "@/features/reports/ranges";
import { ReportsDashboard } from "@/features/reports/ReportsDashboard";
import {
  getRolePermissions,
  getRolePolicy,
  requirePagePermission,
} from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

type ReportsPageProps = {
  searchParams: Promise<{ range?: string }>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const context = await requirePagePermission("reports:read");
  // Reports are workspace-wide and cannot be filtered by job, so a role limited
  // to specific jobs gets an explanation instead of the metrics.
  const policy = await getRolePolicy(context.organization.id, context.roleKey);
  if (!isUnrestrictedScope(policy.scope)) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={ChartColumn}
          title="Reports aren't available yet"
          description="Reports aren't available for roles limited to specific jobs yet."
        />
      </div>
    );
  }
  const { range: rangeRaw } = await searchParams;
  const parsed = Number(rangeRaw);
  const rangeDays = normalizeReportRange(parsed);

  const [data, permissions] = await Promise.all([
    getReportsData(rangeDays),
    getRolePermissions(context.organization.id, context.roleKey),
  ]);

  return <ReportsDashboard data={data} canViewCandidates={permissions.includes("candidates:view")} canViewJobs={permissions.includes("jobs:view")} />;
}
