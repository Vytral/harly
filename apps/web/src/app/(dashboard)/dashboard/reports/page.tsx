import { getReportsData } from "@/features/reports/data";
import { ReportsDashboard } from "@/features/reports/ReportsDashboard";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

const VALID_RANGES = new Set([30, 90, 365]);

type ReportsPageProps = {
  searchParams: Promise<{ range?: string }>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  await requirePagePermission("reports:read");
  const { range: rangeRaw } = await searchParams;
  const parsed = Number(rangeRaw);
  const rangeDays = VALID_RANGES.has(parsed) ? parsed : 30;

  const data = await getReportsData(rangeDays);

  return <ReportsDashboard data={data} />;
}
