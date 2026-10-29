import { isDemoMode } from "@harly/config";

import { CandidatesNeedingReview } from "@/components/dashboard/widgets/CandidatesNeedingReview";
import { HiringPerformance } from "@/components/dashboard/widgets/HiringPerformance";
import { InboxCard } from "@/components/dashboard/widgets/InboxCard";
import { MyTasksCard } from "@/components/dashboard/widgets/MyTasksCard";
import { PipelineOverviewCard } from "@/components/dashboard/widgets/PipelineOverviewCard";
import { SetupChecklistCard } from "@/components/dashboard/widgets/SetupChecklistCard";
import { SampleDataBanner } from "@/features/sample-data/SampleDataBanner";
import { TodayInterviews } from "@/components/dashboard/widgets/TodayInterviews";
import {
  buildSubline,
  GreetingHeader,
} from "@/features/dashboard/GreetingHeader";
import { TriageStrip, type TriageItem } from "@/features/dashboard/TriageStrip";
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
import { getWorkspaceContext } from "@/features/workspaces/context";

export const dynamic = "force-dynamic";

/**
 * Home , the recruiter's cockpit.
 *
 * Two wrong answers preceded this one. The first was a bento of six
 * equal-weight widgets: it informed without pushing, and equal weight meant
 * nothing was important. The second over-read the reference frame and made Home
 * a flat table of applications , but that frame is an employee directory with
 * salaries, an HR surface. An ATS home is not a directory; the directory already
 * exists at /dashboard/candidates. Home has to answer "what needs me today".
 *
 * So: hierarchy, not symmetry, and not a single list either.
 *   1. Greeting , who you are, what today looks like in one line.
 *   2. Triage strip , the four countable answers to "what needs me", each a
 *      link. One glance, above everything.
 *   3. The work , candidates awaiting a decision (widest), today's interviews.
 *   4. Context , pipeline health, inbox.
 *   5. Analytics last , tasks and performance. Useful, never urgent.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const { job } = await searchParams;
  const { user } = await getWorkspaceContext();
  const firstName = (user.name ?? "").trim().split(/\s+/)[0] || "there";
  // The public demo is pre-configured and its settings are locked, so the
  // setup checklist would only send visitors to screens they cannot change.
  const demo = isDemoMode();

  // A widget is rendered only when the caller holds its permission. Each data
  // function also gates itself and returns nothing for a caller without access;
  // hiring performance is not requested at all, since it has no empty form.
  const access = await getDashboardWidgetAccess();
  const [inbox, interviews, pipeline, review, myTasks, performance, setup] =
    await Promise.all([
      getInbox(),
      getTodayInterviews(),
      getPipelineOverview(job),
      getCandidatesNeedingReview(),
      getMyDashboardTasks(),
      access.performance ? getHiringPerformance() : null,
      demo ? null : getSetupChecklist(),
    ]);

  const overdue = inbox.filter((item) => item.dueState === "overdue").length;
  const activeCandidates = pipeline.stages.reduce(
    (total, stage) => total + stage.count,
    0,
  );
  const reviewVisible = access.reviewCandidates;
  const interviewsVisible = access.todayInterviews;
  const triage: TriageItem[] = [];
  if (access.reviewCandidates) {
    triage.push({
      label: "Awaiting your review",
      value: review.length,
      href: "/dashboard/candidates",
      urgent: true,
    });
  }
  if (access.inbox) {
    triage.push({
      label: "Overdue replies",
      value: overdue,
      href: "/dashboard/inbox",
      urgent: true,
    });
  }
  if (access.todayInterviews) {
    triage.push({
      label: "Interviews today",
      value: interviews.length,
      href: "/dashboard/calendars",
    });
  }
  if (access.pipeline) {
    triage.push({
      label: "Candidates in pipeline",
      value: activeCandidates,
      href: "/dashboard/pipeline",
    });
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-4">
      <GreetingHeader
        name={firstName}
        avatarUrl={user.image ?? null}
        hour={new Date().getHours()}
        subline={buildSubline({
          waiting: review.length,
          overdue,
          interviewsToday: interviews.length,
        })}
      />

      {/* Quiet notice while sample records exist; anyone on the team may see it. */}
      {setup?.sampleDataActive ? (
        <div className="mt-5">
          <SampleDataBanner canManage={setup.visible} />
        </div>
      ) : null}

      {/* Collapsed by default; hidden when dismissed or nothing is left to do. */}
      {setup && setup.showCard ? (
        <div className="mt-5">
          <SetupChecklistCard checklist={setup} />
        </div>
      ) : null}

      {triage.length > 0 ? (
        <div className="mt-5">
          <TriageStrip items={triage} />
        </div>
      ) : null}

      {/* The work itself , decisions first, and the widest column gets them. */}
      {reviewVisible || interviewsVisible ? (
        <section className="mt-4 grid gap-4 lg:grid-cols-5">
          {access.reviewCandidates ? (
            <CandidatesNeedingReview
              candidates={review}
              className={interviewsVisible ? "lg:col-span-3" : "lg:col-span-5"}
            />
          ) : null}
          {access.todayInterviews ? (
            <TodayInterviews
              interviews={interviews}
              className={reviewVisible ? "lg:col-span-2" : "lg:col-span-5"}
            />
          ) : null}
        </section>
      ) : null}

      {/* Context for those decisions. */}
      {access.pipeline || access.inbox ? (
        <section className="mt-4 grid gap-4 lg:grid-cols-5">
          {access.pipeline ? (
            <PipelineOverviewCard
              data={pipeline}
              className={access.inbox ? "lg:col-span-3" : "lg:col-span-5"}
            />
          ) : null}
          {access.inbox ? (
            <InboxCard
              items={inbox}
              className={access.pipeline ? "lg:col-span-2" : "lg:col-span-5"}
            />
          ) : null}
        </section>
      ) : null}

      {/* Useful, never urgent , so it sits where the eye arrives last. */}
      {access.tasks || performance ? (
        <section className="mt-4 grid gap-4 lg:grid-cols-5">
          {access.tasks ? (
            <MyTasksCard
              tasks={myTasks}
              className={performance ? "lg:col-span-2" : "lg:col-span-5"}
            />
          ) : null}
          {performance ? (
            <HiringPerformance
              data={performance}
              className={access.tasks ? "lg:col-span-3" : "lg:col-span-5"}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
