import { Suspense } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PipelineBoard } from "@/features/pipeline/PipelineBoard";
import { PipelineJobSelect } from "@/features/pipeline/PipelineJobSelect";
import { PipelineList } from "@/features/pipeline/PipelineList";
import { PipelineViewToggle } from "@/features/pipeline/PipelineViewToggle";
import { getPipelineData } from "@/features/pipeline/data";

export const dynamic = "force-dynamic";

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
  const data = await getPipelineData(jobId ?? job);

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
      {view === "list" ? (
        <PipelineList
          key={`list-${data.selectedJob.id}`}
          stages={data.stages}
          applications={data.applications}
        />
      ) : (
        <PipelineBoard
          key={data.selectedJob.id}
          jobs={data.jobs}
          selectedJob={data.selectedJob}
          stages={data.stages}
          applications={data.applications}
        />
      )}
    </div>
  );
}
