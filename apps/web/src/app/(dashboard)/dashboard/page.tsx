import { CandidatesNeedingReview } from "@/components/dashboard/widgets/CandidatesNeedingReview";
import { HiringPerformance } from "@/components/dashboard/widgets/HiringPerformance";
import { InboxCard } from "@/components/dashboard/widgets/InboxCard";
import { MyTasksCard } from "@/components/dashboard/widgets/MyTasksCard";
import { PipelineOverviewCard } from "@/components/dashboard/widgets/PipelineOverviewCard";
import { TodayInterviews } from "@/components/dashboard/widgets/TodayInterviews";
import {
  getCandidatesNeedingReview,
  getHiringPerformance,
  getInbox,
  getMyDashboardTasks,
  getPipelineOverview,
  getTodayInterviews,
} from "@/features/dashboard/widgets";
import { getWorkspaceContext } from "@/features/workspaces/context";

export const dynamic = "force-dynamic";

const todayFormatter = new Intl.DateTimeFormat("en", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const { job } = await searchParams;
  const { user } = await getWorkspaceContext();
  const firstName = (user.name ?? "").trim().split(/\s+/)[0] || "there";
  const now = new Date();

  const [inbox, interviews, pipeline, review, myTasks, performance] =
    await Promise.all([
      getInbox(),
      getTodayInterviews(),
      getPipelineOverview(job),
      getCandidatesNeedingReview(),
      getMyDashboardTasks(),
      getHiringPerformance(),
    ]);

  const overdueCount = inbox.filter((i) => i.dueState === "overdue").length;
  const reviewCount = review.length;
  const openJobs = pipeline.jobs.length;
  const interviewsToday = interviews.length;

  let insight = "Here's what's happening with your hiring today.";
  if (overdueCount > 0 && reviewCount > 0) {
    insight = `${overdueCount} ${overdueCount === 1 ? "item" : "items"} need your attention and ${reviewCount} ${reviewCount === 1 ? "candidate" : "candidates"} await${reviewCount === 1 ? "s" : ""} review.`;
  } else if (overdueCount > 0) {
    insight = `You have ${overdueCount} ${overdueCount === 1 ? "overdue item" : "overdue items"} to tackle.`;
  } else if (reviewCount > 0) {
    insight = `${reviewCount} ${reviewCount === 1 ? "candidate" : "candidates"} ${reviewCount === 1 ? "is" : "are"} waiting for your feedback.`;
  } else if (interviewsToday > 0) {
    insight = `${interviewsToday} interview${interviewsToday > 1 ? "s" : ""} scheduled today. Let's go!`;
  } else if (openJobs > 0) {
    insight = `${openJobs} open ${openJobs === 1 ? "position" : "positions"} — keep the pipeline moving.`;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2 duration-500 animate-in fade-in slide-in-from-bottom-1">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {greeting(now.getHours())}, {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {insight}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {todayFormatter.format(now)}
        </p>
      </header>

      <section className="grid gap-4 duration-500 animate-in fade-in slide-in-from-bottom-2 lg:grid-cols-3">
        <InboxCard items={inbox} />
        <TodayInterviews interviews={interviews} />
        <PipelineOverviewCard data={pipeline} />
      </section>

      <section className="grid gap-4 duration-500 animate-in fade-in slide-in-from-bottom-3 lg:grid-cols-5">
        <CandidatesNeedingReview candidates={review} className="lg:col-span-3" />
        <MyTasksCard tasks={myTasks} className="lg:col-span-2" />
      </section>

      <div className="duration-500 animate-in fade-in slide-in-from-bottom-3">
        <HiringPerformance data={performance} />
      </div>
    </div>
  );
}
