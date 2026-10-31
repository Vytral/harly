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
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { countCandidatePool } from "@/features/matching/data";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { can, requirePagePermission } from "@/features/workspaces/permissions-server";

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
      submitLabel="Save changes"
      departments={departments}
      hiringTeam={hiringTeam}
      workspaceMembers={workspaceMembers}
      aiConfigured={aiStatus.enabled && aiStatus.hasApiKey}
      candidatePoolCount={candidatePoolCount}
      eyebrow="Job detail"
      statusBadge={<JobStatusBadge status={job.status} />}
      previewWorkspace={careerPageData?.workspace ?? null}
      previewConfig={careerPageData?.config ?? null}
      headerActions={
        <JobActionsMenu jobId={job.id} slug={job.slug} redirectAfterTrash />
      }
      railActions={
        <>
          {stats ? (
            <JobHiringProgress
              jobId={job.id}
              applicants={stats.applicants}
              active={stats.activeApplicants}
              newThisWeek={stats.newApplicants}
            />
          ) : null}
          <Button asChild variant="outline" size="sm" className="w-full justify-start">
            <a href={`/jobs/${job.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              View job
            </a>
          </Button>
          <JobShareButton
            url={publicUrl}
            title={job.title}
            workspaceSlug={workspace.slug}
            slug={job.slug}
          />
          <JobStatusActions job={job} />
          {canEditJobs ? (
            <StageEditorTrigger
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
