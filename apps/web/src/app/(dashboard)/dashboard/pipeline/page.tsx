import { Suspense } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PipelineBoard } from "@/features/pipeline/PipelineBoard";
import { JobCandidateRanking } from "@/features/pipeline/JobCandidateRanking";
import { PipelineJobSelect } from "@/features/pipeline/PipelineJobSelect";
import { PipelineList } from "@/features/pipeline/PipelineList";
import { PipelineSummaryCard } from "@/features/pipeline/PipelineSummaryCard";
import { PipelineViewToggle } from "@/features/pipeline/PipelineViewToggle";
import { getPipelineData, type PipelineData } from "@/features/pipeline/data";
import { getWorkspaceAiStatus } from "@/lib/ai/config";
import { getWorkspaceContext } from "@/features/workspaces/context";

export const dynamic = "force-dynamic";

type PipelineDataReady = Extract<PipelineData, { kind: "ready" }>;

type PipelinePageProps = {
  searchParams: Promise<{
    job?: string;
    jobId?: string;
    view?: string;
  }>;
};

export default async function PipelinePage({ searchParams }: PipelinePageProps) {
  const { job, jobId, view: rawView } = await searchParams;
  const view = rawView === "board" ? "board" : "list";
  const { organization: workspace } = await getWorkspaceContext();
  const [data, aiStatus] = await Promise.all([
    getPipelineData(jobId ?? job),
    getWorkspaceAiStatus(workspace.id),
  ]);

  if (data.kind === "empty") {
    return (
      <div className="space-y-4">
        <EmptyState
          title="No jobs yet"
          description="Create a job to start building your pipeline."
          action={{ href: "/dashboard/jobs/new", label: "Create job" }}
        />
      </div>
    );
  }

  const toolbar = (
    <div className="flex items-center justify-between gap-3">
      <Suspense>
        <PipelineJobSelect jobs={data.jobs} selectedJobId={data.selectedJob.id} />
      </Suspense>
      {data.stages.length > 0 ? (
        <PipelineViewToggle jobId={data.selectedJob.id} view={view} />
      ) : null}
    </div>
  );

  if (data.stages.length === 0) {
    return (
      <div className="space-y-4">
        {toolbar}
        <EmptyState
          title="No stages configured"
          description="Add pipeline stages to this job to start tracking candidates."
        />
      </div>
    );
  }

  if (data.applications.length === 0) {
    return (
      <div className="space-y-4">
        {toolbar}
        <EmptyState
          title="No candidates yet"
          description="Candidates will appear here once they apply."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toolbar}
      <Suspense fallback={null}>
        <PipelineSummaryCard jobId={data.selectedJob.id} />
      </Suspense>
      <JobCandidateRanking
        key={`ranking-${data.selectedJob.id}`}
        jobId={data.selectedJob.id}
        jobTitle={data.selectedJob.title}
        applications={data.applications}
        stages={data.stages}
        aiConfigured={
          aiStatus.enabled && aiStatus.hasApiKey && aiStatus.encryptionReady
        }
      />
      {view === "list" ? (
        <PipelineList
          key={`list-${data.selectedJob.id}`}
          stages={data.stages}
          applications={data.applications}
        />
      ) : (
        <PipelineBoard
          key={pipelineBoardKey(data.selectedJob.id, data.stages, data.applications)}
          jobs={data.jobs}
          selectedJob={data.selectedJob}
          stages={data.stages}
          applications={data.applications}
        />
      )}
    </div>
  );
}

function pipelineBoardKey(
  jobId: string,
  stages: PipelineDataReady["stages"],
  applications: PipelineDataReady["applications"],
) {
  const stageVersion = stages
    .map((stage) => `${stage.id}:${stage.order}:${stage.emailConfig.candidateUpdatesEnabled}`)
    .join(",");
  const applicationVersion = applications
    .map(
      (application) =>
        `${application.id}:${application.currentStageId}:${application.pipelineOrder}:${application.status}:${application.lastStageMovedAt ?? ""}:${application.aiScore ?? ""}`,
    )
    .join(",");
  return `${jobId}:${stageVersion}:${applicationVersion}`;
}
