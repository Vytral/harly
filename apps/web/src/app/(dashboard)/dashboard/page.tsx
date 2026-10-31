import { isDemoMode } from "@harly/config";

import { CandidatesNeedingReview } from "@/components/dashboard/widgets/CandidatesNeedingReview";
import { HiringPerformance } from "@/components/dashboard/widgets/HiringPerformance";
import { InboxCard } from "@/components/dashboard/widgets/InboxCard";
import { IntegrationAttentionCard } from "@/components/dashboard/widgets/IntegrationAttentionCard";
import { MyTasksCard } from "@/components/dashboard/widgets/MyTasksCard";
import { PipelineOverviewCard } from "@/components/dashboard/widgets/PipelineOverviewCard";
import { SetupChecklistCard } from "@/components/dashboard/widgets/SetupChecklistCard";
import { SampleDataBanner } from "@/features/sample-data/SampleDataBanner";
import { TodayInterviews } from "@/components/dashboard/widgets/TodayInterviews";
import { buildSubline } from "@/features/dashboard/GreetingHeader";
import { AtAGlanceCard, type GlanceItem } from "@/components/dashboard/widgets/AtAGlanceCard";
import {
  ForYouTodayCard,
  type ForYouItem,
} from "@/components/dashboard/widgets/ForYouTodayCard";
import { HomeGreeting } from "@/components/dashboard/widgets/HomeGreeting";
import { CalendarClock, ClipboardCheck, Inbox, ListChecks } from "lucide-react";
import {
  getCandidatesNeedingReview,
  getDashboardWidgetAccess,
  getHiringPerformance,
  getInbox,
  getMyDashboardTasks,
  getPipelineOverview,
  getTodayInterviews,
} from "@/features/dashboard/widgets";
import { getSetupChecklist } from "@/features/dashboard/setup-checklist";
import { setupReadsFor } from "@/features/onboarding/checklist-model";
import { getSampleDataStatus } from "@/features/sample-data/service";
import { getWorkspaceContext } from "@/features/workspaces/context";

export const dynamic = "force-dynamic";

/**
 * Home: the recruiter's cockpit, answering "what needs me today".
 *
 * A centered greeting, then two columns of cards. The left column is the work
 * (what is waiting on you, candidates to review, pipeline, tasks); the right is
 * context (at-a-glance counts, today's interviews, inbox, performance).
 * On narrow screens the columns stack in the same order.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const { job } = await searchParams;
  const { user, organization, role } = await getWorkspaceContext();
  const canManageSetup = role === "owner" || role === "admin";
  const firstName = (user.name ?? "").trim().split(/\s+/)[0] || "there";
  // The public demo is pre-configured and its settings are locked, so the
  // setup checklist would only send visitors to screens they cannot change.
  const demo = isDemoMode();
  const setupReads = setupReadsFor({ demo, canManage: canManageSetup });

  // A widget is rendered only when the caller holds its permission. Each data
  // function also gates itself and returns nothing for a caller without access;
  // hiring performance is not requested at all, since it has no empty form.
  const access = await getDashboardWidgetAccess();
  const [inbox, interviews, pipeline, review, myTasks, performance, setup, sampleStatus] =
    await Promise.all([
      getInbox(),
      getTodayInterviews(),
      getPipelineOverview(job),
      getCandidatesNeedingReview(),
      getMyDashboardTasks(),
      access.performance ? getHiringPerformance() : null,
      setupReads.checklist ? getSetupChecklist() : null,
      setupReads.sampleStatus ? getSampleDataStatus(organization.id) : null,
    ]);
  const sampleDataActive = setup?.sampleDataActive ?? sampleStatus?.active ?? false;

  const overdue = inbox.filter((item) => item.dueState === "overdue").length;
  const activeCandidates = pipeline.stages.reduce(
    (total, stage) => total + stage.count,
    0,
  );
  const dueTasks = myTasks.filter(
    (task) => task.dueState === "overdue" || task.dueState === "today",
  ).length;

  const glance: GlanceItem[] = [];
  if (access.reviewCandidates) {
    glance.push({ label: "Awaiting your review", value: review.length, href: "/dashboard/candidates" });
  }
  if (access.inbox) {
    glance.push({ label: "Overdue replies", value: overdue, href: "/dashboard/inbox" });
  }
  if (access.todayInterviews) {
    glance.push({ label: "Interviews today", value: interviews.length, href: "/dashboard/calendars" });
  }
  if (access.pipeline) {
    glance.push({ label: "In pipeline", value: activeCandidates, href: "/dashboard/pipeline" });
  }

  const forYou: ForYouItem[] = [];
  if (access.reviewCandidates) {
    forYou.push({ label: "Candidates to review", count: review.length, href: "/dashboard/candidates", icon: ClipboardCheck, action: "Review" });
  }
  if (access.inbox) {
    forYou.push({ label: "Inbox requests", count: inbox.length, href: "/dashboard/inbox", icon: Inbox, action: "Open" });
  }
  if (access.tasks) {
    forYou.push({ label: "Tasks due", count: dueTasks, href: "/dashboard/tasks", icon: ListChecks, action: "View" });
  }
  if (access.todayInterviews) {
    forYou.push({ label: "Interviews today", count: interviews.length, href: "/dashboard/calendars", icon: CalendarClock, action: "View" });
  }

  const hasLeftColumn = forYou.length > 0 || access.reviewCandidates || access.pipeline || access.tasks;
  const hasRightColumn = glance.length > 0 || access.todayInterviews || access.inbox || performance;

  return (
    <div className="mx-auto w-full max-w-[1200px] pb-6">
      <HomeGreeting
        name={firstName}
        hour={new Date().getHours()}
        subline={buildSubline({
          waiting: review.length,
          overdue,
          interviewsToday: interviews.length,
        })}
      />

      {/* Quiet notice while sample records exist; anyone on the team may see it. */}
      {sampleDataActive ? (
        <div className="mt-5">
          <SampleDataBanner canManage={canManageSetup} />
        </div>
      ) : null}

      {/* Collapsed by default; hidden when dismissed or nothing is left to do. */}
      {setup && setup.showCard ? (
        <div className="mt-5">
          <SetupChecklistCard checklist={setup} />
        </div>
      ) : null}

      <IntegrationAttentionCard />

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
        {hasLeftColumn ? (
          <div className="flex min-w-0 flex-col gap-4">
            {forYou.length > 0 ? <ForYouTodayCard items={forYou} /> : null}
            {access.reviewCandidates ? <CandidatesNeedingReview candidates={review} /> : null}
            {access.pipeline ? <PipelineOverviewCard data={pipeline} /> : null}
            {access.tasks ? <MyTasksCard tasks={myTasks} /> : null}
          </div>
        ) : null}
        {hasRightColumn ? (
          <div className="flex min-w-0 flex-col gap-4">
            {glance.length > 0 ? <AtAGlanceCard items={glance} /> : null}
            {access.todayInterviews ? <TodayInterviews interviews={interviews} /> : null}
            {access.inbox ? <InboxCard items={inbox} /> : null}
            {performance ? <HiringPerformance data={performance} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
