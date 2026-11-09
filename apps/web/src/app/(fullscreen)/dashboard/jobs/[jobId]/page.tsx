import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { JobStatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { updateJobAction } from "@/features/jobs/actions";
import {
  getDashboardJob,
  listJobsWithStats,
  listWorkspaceDepartments,
} from "@/features/jobs/data";
import { getCareerPageData } from "@/features/career-page/data";
import {
  listJobHiringTeam,
  listWorkspaceMembers,
} from "@/features/jobs/hiring-team-data";
import { JobForm } from "@/features/jobs/JobForm";
import { JobHiringProgress } from "@/features/jobs/JobHiringProgress";
import { JobPublishedDialog } from "@/features/jobs/JobPublishedDialog";
import { JobActionsMenu } from "@/features/jobs/JobActionsMenu";
import { JobShareButton } from "@/features/jobs/JobShareButton";
import { JobStatusActions } from "@/features/jobs/JobStatusActions";
import { StageEditorTrigger } from "@/features/pipeline/stage-editor/StageEditorTrigger";
import { getWorkspaceAiStatus } from "@/lib/ai/config";
import { isAiUsable } from "@/lib/ai/availability-shared";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { countCandidatePool } from "@/features/matching/data";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { can, requirePagePermission } from "@/features/workspaces/permissions-server";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

type DashboardJobPageProps = {
  params: Promise<{
    jobId: string;
  }>;
  searchParams?: Promise<{ published?: string }>;
};

export default async function DashboardJobPage({
  params,
  searchParams,
}: DashboardJobPageProps) {
  const t = await getTranslations("jobs.form");
  await requirePagePermission("jobs:view");
  const { jobId } = await params;
  const justPublished = (await searchParams)?.published === "1";
  // Resolve the job first. getDashboardJob applies the caller's job scope, so a
  // job outside it is not found and nothing job-specific (such as its hiring
  // team) is loaded for it.
  const result = await getDashboardJob(jobId);
  if (!result) {
    notFound();
  }
  const { organization: workspace } = await getWorkspaceContext();
  const [departments, hiringTeam, workspaceMembers, aiStatus, candidatePoolCount, careerPageData, canEditJobs, allJobStats] =
    await Promise.all([
      listWorkspaceDepartments(),
      listJobHiringTeam(jobId),
      listWorkspaceMembers(),
      getWorkspaceAiStatus(workspace.id),
      countCandidatePool(workspace.id),
      getCareerPageData(workspace.slug),
      can("jobs:edit"),
      listJobsWithStats(),
    ]);
  const stats = allJobStats.find((row) => row.id === jobId);

  const { job } = result;
  const appUrl = getHarlyPublicOrigin();
  // Canonical public job details (overview), never the apply form.
  const publicUrl = `${appUrl}/board/${workspace.slug}/jobs/${job.slug}`;

  return (
    <>
    {justPublished ? <JobPublishedDialog jobTitle={job.title} /> : null}
    <JobForm
      action={updateJobAction}
      job={job}
      submitLabel={t("saveChanges")}
      departments={departments}
      hiringTeam={hiringTeam}
      workspaceMembers={workspaceMembers}
      aiConfigured={isAiUsable(aiStatus)}
      candidatePoolCount={candidatePoolCount}
      eyebrow={t("jobDetail")}
      statusBadge={<JobStatusBadge status={job.status} />}
      previewWorkspace={careerPageData?.workspace ?? null}
      previewConfig={careerPageData?.config ?? null}
      headerActions={
        <JobActionsMenu jobId={job.id} slug={job.slug} redirectAfterTrash />
      }
      // Rendered twice (rail + mobile popover), so the children carry keys.
      railActions={
        <>
          {stats ? (
            <JobHiringProgress
              key="progress"
              jobId={job.id}
              applicants={stats.applicants}
              active={stats.activeApplicants}
              newThisWeek={stats.newApplicants}
            />
          ) : null}
          <Button key="view" asChild variant="outline" size="sm" className="w-full justify-start">
            <a href={`/jobs/${job.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              {t("viewJob")}
            </a>
          </Button>
          <JobShareButton
            key="share"
            url={publicUrl}
            title={job.title}
            workspaceSlug={workspace.slug}
            slug={job.slug}
          />
          <JobStatusActions key="status" job={job} />
          {canEditJobs ? (
            <StageEditorTrigger
              key="stages"
              jobId={job.id}
              jobTitle={job.title}
              className="w-full justify-start"
            />
          ) : null}
        </>
      }
    />
    </>
  );
}
