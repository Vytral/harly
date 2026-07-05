import { listInterviewsForRange } from "@/features/interviews/data";
import { CalendarBoard } from "@/features/interviews/CalendarBoard";
import { listJobOptions } from "@/features/jobs/data";
import { listWorkspaceMembers } from "@/features/jobs/hiring-team-data";

const MONTH_LABEL_FORMAT = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
});

function parseMonthParam(raw: string | undefined): { year: number; month: number; param: string } {
  const now = new Date();
  const match = raw ? /^(\d{4})-(\d{2})$/.exec(raw) : null;
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) : now.getMonth() + 1;
  return { year, month, param: `${year}-${String(month).padStart(2, "0")}` };
}

type CalendarsPageProps = {
  searchParams: Promise<{ month?: string }>;
};

export default async function CalendarsPage({ searchParams }: CalendarsPageProps) {
  const { month: monthRaw } = await searchParams;
  const { year, month, param } = parseMonthParam(monthRaw);

  const monthStart = new Date(year, month - 1, 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridEnd.getDate() + 42);

  const [interviews, jobs, members] = await Promise.all([
    listInterviewsForRange(gridStart, gridEnd),
    listJobOptions(),
    listWorkspaceMembers(),
  ]);

  return (
    <CalendarBoard
      monthParam={param}
      monthLabel={MONTH_LABEL_FORMAT.format(monthStart)}
      interviews={interviews}
      jobOptions={jobs.map((j) => ({ value: j.id, label: j.title }))}
      interviewerOptions={members.map((m) => ({ value: m.userId, label: m.name }))}
    />
  );
}
