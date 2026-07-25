import { CandidatesNeedingReview } from "@/components/dashboard/widgets/CandidatesNeedingReview";
import { HiringPerformance } from "@/components/dashboard/widgets/HiringPerformance";
import { InboxCard } from "@/components/dashboard/widgets/InboxCard";
import { MyTasksCard } from "@/components/dashboard/widgets/MyTasksCard";
import { PipelineOverviewCard } from "@/components/dashboard/widgets/PipelineOverviewCard";
import { SetupChecklistCard } from "@/components/dashboard/widgets/SetupChecklistCard";
import { TodayInterviews } from "@/components/dashboard/widgets/TodayInterviews";
import {
  buildSubline,
  GreetingHeader,
} from "@/features/dashboard/GreetingHeader";
import { TriageStrip } from "@/features/dashboard/TriageStrip";
import {
  getCandidatesNeedingReview,
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

  const [inbox, interviews, pipeline, review, myTasks, performance, setup] =
    await Promise.all([
      getInbox(),
      getTodayInterviews(),
      getPipelineOverview(job),
      getCandidatesNeedingReview(),
      getMyDashboardTasks(),
      getHiringPerformance(),
      getSetupChecklist(),
    ]);

  const overdue = inbox.filter((item) => item.dueState === "overdue").length;
  const activeCandidates = pipeline.stages.reduce(
    (total, stage) => total + stage.count,
    0,
  );

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

      {/* Collapsed by default, and gone entirely once setup is complete. */}
      {setup.visible && !setup.allDone ? (
        <div className="mt-5">
          <SetupChecklistCard checklist={setup} />
        </div>
      ) : null}

      <div className="mt-5">
        <TriageStrip
          items={[
            {
              label: "Awaiting your review",
              value: review.length,
              href: "/dashboard/candidates",
              urgent: true,
            },
            {
              label: "Overdue replies",
              value: overdue,
              href: "/dashboard/inbox",
              urgent: true,
            },
            {
              label: "Interviews today",
              value: interviews.length,
              href: "/dashboard/calendars",
            },
            {
              label: "Candidates in pipeline",
              value: activeCandidates,
              href: "/dashboard/pipeline",
            },
          ]}
        />
      </div>

      {/* The work itself , decisions first, and the widest column gets them. */}
      <section className="mt-4 grid gap-4 lg:grid-cols-5">
        <CandidatesNeedingReview candidates={review} className="lg:col-span-3" />
        <TodayInterviews interviews={interviews} className="lg:col-span-2" />
      </section>

      {/* Context for those decisions. */}
      <section className="mt-4 grid gap-4 lg:grid-cols-5">
        <PipelineOverviewCard data={pipeline} className="lg:col-span-3" />
        <InboxCard items={inbox} className="lg:col-span-2" />
      </section>

      {/* Useful, never urgent , so it sits where the eye arrives last. */}
      <section className="mt-4 grid gap-4 lg:grid-cols-5">
        <MyTasksCard tasks={myTasks} className="lg:col-span-2" />
        <HiringPerformance data={performance} className="lg:col-span-3" />
      </section>
    </div>
  );
}
