import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/ui/PageHeader";
import { JobStatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { updateJobAction } from "@/features/jobs/actions";
import {
  getDashboardJob,
  listWorkspaceDepartments,
} from "@/features/jobs/data";
import {
  listJobHiringTeam,
  listWorkspaceMembers,
} from "@/features/jobs/hiring-team-data";
import { JobForm } from "@/features/jobs/JobForm";
import { JobActionsMenu } from "@/features/jobs/JobActionsMenu";
import { JobShareButton } from "@/features/jobs/JobShareButton";
import { JobStatusActions } from "@/features/jobs/JobStatusActions";
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
        titleBadge={<JobStatusBadge status={job.status} className="px-2.5 py-1 text-sm" />}
        description={`/${job.slug}`}
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
        hiringTeam={hiringTeam}
        workspaceMembers={workspaceMembers}
        aiConfigured={aiStatus.enabled && aiStatus.hasApiKey}
      />
    </div>
  );
}
