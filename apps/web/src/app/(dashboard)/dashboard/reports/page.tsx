import { getReportsData } from "@/features/reports/data";
import { normalizeReportRange } from "@/features/reports/ranges";
import { ReportsDashboard } from "@/features/reports/ReportsDashboard";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

type ReportsPageProps = {
  searchParams: Promise<{ range?: string }>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  await requirePagePermission("reports:read");
  const { range: rangeRaw } = await searchParams;
  const parsed = Number(rangeRaw);
  const rangeDays = normalizeReportRange(parsed);

  const data = await getReportsData(rangeDays);

  return <ReportsDashboard data={data} />;
}
