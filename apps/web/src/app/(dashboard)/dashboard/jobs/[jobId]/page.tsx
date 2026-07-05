import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { updateJobAction } from "@/features/jobs/actions";
import {
  formatJobStatus,
  getDashboardJob,
  listWorkspaceDepartments,
} from "@/features/jobs/data";
import {
  listJobHiringTeam,
  listWorkspaceMembers,
} from "@/features/jobs/hiring-team-data";
import { JobForm } from "@/features/jobs/JobForm";
import { JobActionsMenu } from "@/features/jobs/JobActionsMenu";
import { JobHiringTeam } from "@/features/jobs/JobHiringTeam";
import { PublicJobPreview } from "@/features/jobs/PublicJobPreview";
import { JobShareButton } from "@/features/jobs/JobShareButton";
import { JobStatusActions } from "@/features/jobs/JobStatusActions";
import { SemanticMatchPanel } from "@/features/matching/SemanticMatchPanel";
import { getWorkspaceAiStatus } from "@/lib/ai/config";
import { getWorkspaceContext } from "@/features/workspaces/context";

export const dynamic = "force-dynamic";

type DashboardJobPageProps = {
  params: Promise<{
    jobId: string;
  }>;
};

export default async function DashboardJobPage({
  params,
}: DashboardJobPageProps) {
  const { jobId } = await params;
  const { organization: workspace } = await getWorkspaceContext();
  const [result, departments, hiringTeam, workspaceMembers, aiStatus] = await Promise.all([
    getDashboardJob(jobId),
    listWorkspaceDepartments(),
    listJobHiringTeam(jobId),
    listWorkspaceMembers(),
    getWorkspaceAiStatus(workspace.id),
  ]);

  if (!result) {
    notFound();
  }

  const { job } = result;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const publicUrl = `${appUrl}/jobs/${job.slug}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Job detail"
        title={job.title}
        description={`Status: ${formatJobStatus(job.status)} · /${job.slug}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`/jobs/${job.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                View job
              </a>
            </Button>
            <JobShareButton url={publicUrl} />
            <JobStatusActions job={job} />
            <JobActionsMenu jobId={job.id} slug={job.slug} redirectAfterTrash />
          </div>
        }
      />

      <JobForm
        action={updateJobAction}
        job={job}
        submitLabel="Save changes"
        departments={departments}
      />
      <JobHiringTeam
        jobId={job.id}
        team={hiringTeam}
        members={workspaceMembers}
      />
      <SemanticMatchPanel jobId={job.id} aiConfigured={aiStatus.enabled && aiStatus.hasApiKey} />
      <PublicJobPreview slug={job.slug} />
    </div>
  );
}
