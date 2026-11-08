import { isDemoMode } from "@harly/config";
import { CalendarClock, ClipboardCheck, FileCheck, ListChecks } from "lucide-react";

import { CandidatesNeedingReview } from "@/components/dashboard/widgets/CandidatesNeedingReview";
import {
  ForYouTodayCard,
  type ForYouItem,
} from "@/components/dashboard/widgets/ForYouTodayCard";
import { FirstRunWelcome } from "@/components/dashboard/widgets/FirstRunWelcome";
import { HiringPerformance } from "@/components/dashboard/widgets/HiringPerformance";
import { HomeGreeting } from "@/components/dashboard/widgets/HomeGreeting";
import { InboxCard } from "@/components/dashboard/widgets/InboxCard";
import { IntegrationAttentionCard } from "@/components/dashboard/widgets/IntegrationAttentionCard";
import { MyTasksCard } from "@/components/dashboard/widgets/MyTasksCard";
import { PipelineOverviewCard } from "@/components/dashboard/widgets/PipelineOverviewCard";
import { SetupChecklistCard } from "@/components/dashboard/widgets/SetupChecklistCard";
import { TodayInterviews } from "@/components/dashboard/widgets/TodayInterviews";
import { buildSubline } from "@/features/dashboard/GreetingHeader";
import {
  getCandidatesNeedingReview,
  getDashboardWidgetAccess,
  getHiringPerformance,
  getInbox,
  getInterviewsToSchedule,
  getMyDashboardTasks,
  getPipelineOverview,
  getTodayInterviews,
} from "@/features/dashboard/widgets";
import { getSetupChecklist } from "@/features/dashboard/setup-checklist";
import { setupReadsFor } from "@/features/onboarding/checklist-model";
import { REVIEW_QUEUE_HREF } from "@/features/review/rules";
import { SampleDataBanner } from "@/features/sample-data/SampleDataBanner";
import { getSampleDataStatus } from "@/features/sample-data/service";
import { getWorkspaceContext } from "@/features/workspaces/context";

export const dynamic = "force-dynamic";

/**
 * Home: the recruiter's cockpit, answering "what needs me today".
 *
 * A centered greeting, then two columns of cards. The left column is the work
 * (what is waiting on you, candidates to review, pipeline, tasks); the right is
 * context (today's interviews, decisions waiting, performance). On narrow
 * screens the columns stack in the same order.
 *
 * Every count is a real total from the same query its destination uses, so the
 * number on Home equals the rows you land on.
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
  const [inbox, interviews, scheduling, pipeline, review, myTasks, performance, setup, sampleStatus] =
    await Promise.all([
      getInbox(),
      getTodayInterviews(),
      access.scheduling ? getInterviewsToSchedule() : null,
      getPipelineOverview(job),
      getCandidatesNeedingReview(),
      getMyDashboardTasks(),
      access.performance ? getHiringPerformance() : null,
      setupReads.checklist ? getSetupChecklist() : null,
      setupReads.sampleStatus ? getSampleDataStatus(organization.id) : null,
    ]);
  // A brand-new workspace: no real job and no real applicant yet. Sample rows do
  // not count, so loading sample data keeps the welcome until real work starts.
  const firstRun =
    !!setup &&
    setup.visible &&
    !setup.items.some(
      (item) =>
        (item.key === "create_job" || item.key === "pipeline_candidates") && item.done,
    );
  const aiConfigured = !!setup?.items.find((item) => item.key === "connect_ai")?.done;
  const sampleDataActive = setup?.sampleDataActive ?? sampleStatus?.active ?? false;

  const forYou: ForYouItem[] = [];
  if (access.reviewCandidates) {
    forYou.push({ label: "Candidates to review", count: review.total, href: REVIEW_QUEUE_HREF, icon: ClipboardCheck, action: "Review" });
  }
  if (access.approvals) {
    forYou.push({ label: "Jobs to approve", count: inbox.total, href: "/dashboard/jobs", icon: FileCheck, action: "Open" });
  }
  if (access.tasks) {
    forYou.push({ label: "Tasks due", count: myTasks.dueNow, href: "/dashboard/tasks?owner=me&due=overdue,today", icon: ListChecks, action: "View" });
  }
  if (access.todayInterviews && interviews.date) {
    forYou.push({ label: "Interviews today", count: interviews.total, href: `/dashboard/calendars?date=${interviews.date}`, icon: CalendarClock, action: "View" });
  }

  const hasLeftColumn = forYou.length > 0 || access.reviewCandidates || access.pipeline || access.tasks;
  const showApprovals = access.approvals && inbox.total > 0;
  const hasRightColumn = access.todayInterviews || showApprovals || performance;

  return (
    <div className="mx-auto w-full max-w-[1200px] pb-6">
      <HomeGreeting
        name={firstName}
        hour={new Date().getHours()}
        subline={
          firstRun
            ? "Let's get your first role live. Everything else follows from there."
            : buildSubline({
                toReview: review.total,
                waitingOverWeek: review.waitingOverWeek,
                interviewsToday: interviews.total,
              })
        }
      />

      {/* Quiet notice while sample records exist; anyone on the team may see it. */}
      {sampleDataActive ? (
        <div className="mt-5">
          <SampleDataBanner canManage={canManageSetup} />
        </div>
      ) : null}

      {firstRun && setup ? (
        <FirstRunWelcome checklist={setup} aiConfigured={aiConfigured} />
      ) : null}

      {/* Collapsed by default; hidden when dismissed or nothing is left to do. */}
      {setup && setup.showCard ? (
        <div className="mt-5">
          <SetupChecklistCard checklist={setup} />
        </div>
      ) : null}

      <IntegrationAttentionCard />

      <div className="mt-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {hasLeftColumn ? (
          <div className="stagger-in flex min-w-0 flex-col gap-4">
            {forYou.length > 0 ? <ForYouTodayCard items={forYou} /> : null}
            {access.reviewCandidates ? <CandidatesNeedingReview review={review} /> : null}
            {access.pipeline ? <PipelineOverviewCard data={pipeline} /> : null}
            {access.tasks ? <MyTasksCard tasks={myTasks} /> : null}
          </div>
        ) : null}
        {hasRightColumn ? (
          <div className="stagger-in flex min-w-0 flex-col gap-4">
            {access.todayInterviews ? (
              <TodayInterviews interviews={interviews} scheduling={scheduling} />
            ) : null}
            {showApprovals ? <InboxCard inbox={inbox} /> : null}
            {performance ? <HiringPerformance data={performance} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
