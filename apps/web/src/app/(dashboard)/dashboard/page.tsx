
import { ApplicationsBoardTable } from "@/features/dashboard/ApplicationsBoardTable";
import {
  buildSubline,
  GreetingHeader,
} from "@/features/dashboard/GreetingHeader";
import { SetupChecklistCard } from "@/components/dashboard/widgets/SetupChecklistCard";
import { getApplicationsBoard } from "@/features/dashboard/applications-board";
import { getTodayInterviews } from "@/features/dashboard/widgets";
import { getSetupChecklist } from "@/features/dashboard/setup-checklist";
import { getWorkspaceContext } from "@/features/workspaces/context";

export const dynamic = "force-dynamic";

/**
 * Home , the human work table (DESIGN.md , "Home is a human work table, not a
 * 6-card widget bento").
 *
 * What used to be here: a greeting with a waving emoji, a permanent setup card,
 * then six equal-weight widgets (inbox, interviews, pipeline, review, tasks,
 * performance chart) that informed without pushing. Six cards of equal weight
 * means nothing is important.
 *
 * What is here now: who needs a decision from you, as people, in one table. The
 * widgets did not die pointlessly , their destinations are one rail click away
 * (Inbox, Pipeline) or in the More menu (Tasks, Reports), which is where a
 * recruiter goes deliberately rather than glancing at a mural.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string; stage?: string }>;
}) {
  const { job, stage } = await searchParams;
  const { user } = await getWorkspaceContext();
  const firstName = (user.name ?? "").trim().split(/\s+/)[0] || "there";

  const [board, interviews, setup] = await Promise.all([
    getApplicationsBoard({ jobId: job, stage }),
    getTodayInterviews(),
    getSetupChecklist(),
  ]);

  const overdue = board.applications.filter(
    (application) => application.daysWaiting >= 7,
  ).length;

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <GreetingHeader
        name={firstName}
        avatarUrl={user.image ?? null}
        hour={new Date().getHours()}
        subline={buildSubline({
          waiting: board.totalActive,
          overdue,
          interviewsToday: interviews.length,
        })}
      />

      {/* Collapsed by default, and only while genuinely incomplete , not a
          permanent card of guilt (or of congratulation) above the work. */}
      {setup.visible && !setup.allDone ? (
        <div className="mt-5">
          <SetupChecklistCard checklist={setup} />
        </div>
      ) : null}

      <ApplicationsBoardTable board={board} filters={{ job, stage }} />
    </div>
  );
}
