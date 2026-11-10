import { getLocale } from "next-intl/server";

import { listInterviewsForRange } from "@/features/interviews/data";
import { CalendarBoard } from "@/features/interviews/CalendarBoard";
import { listJobOptions } from "@/features/jobs/data";
import { listWorkspaceMembers } from "@/features/jobs/hiring-team-data";
import { requireAnyPagePermission } from "@/features/workspaces/permissions-server";

function parseMonthParam(raw: string | undefined): { year: number; month: number; param: string } {
  const now = new Date();
  const match = raw ? /^(\d{4})-(\d{2})$/.exec(raw) : null;
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) : now.getMonth() + 1;
  return { year, month, param: `${year}-${String(month).padStart(2, "0")}` };
}

/** `?date=YYYY-MM-DD`: a real calendar day, or null. */
function parseDateParam(raw: string | undefined): { year: number; month: number; day: number } | null {
  const match = raw ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw) : null;
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(year, month - 1, day);
  const real =
    check.getFullYear() === year && check.getMonth() === month - 1 && check.getDate() === day;
  return real ? { year, month, day } : null;
}

type CalendarsPageProps = {
  searchParams: Promise<{ month?: string; date?: string }>;
};

export default async function CalendarsPage({ searchParams }: CalendarsPageProps) {
  await requireAnyPagePermission(["interviews:manage", "interviews:feedback"]);
  const { month: monthRaw, date: dateRaw } = await searchParams;
  // `?date=` (Home's "Interviews today") wins over `?month=`: show that day's
  // month with the day selected.
  const focus = parseDateParam(dateRaw);
  const { year, month, param } = focus
    ? parseMonthParam(`${focus.year}-${String(focus.month).padStart(2, "0")}`)
    : parseMonthParam(monthRaw);

  const locale = await getLocale();
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
      key={dateRaw ?? "month"}
      focusDate={focus ? `${param}-${String(focus.day).padStart(2, "0")}` : null}
      monthParam={param}
      monthLabel={new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(monthStart)}
      interviews={interviews}
      jobOptions={jobs.map((j) => ({ value: j.id, label: j.title }))}
      interviewerOptions={members.map((m) => ({ value: m.userId, label: m.name }))}
    />
  );
}
