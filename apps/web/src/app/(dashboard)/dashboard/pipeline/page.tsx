import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
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
      <div className="space-y-6">
        <PageHeader
          eyebrow="Pipeline"
          title="Candidate movement"
          description="Move applicants through each hiring stage for a selected job."
        />
        <EmptyState
          title="No jobs yet"
          description="Create a job to get started."
          action={{ href: "/dashboard/jobs/new", label: "Create job" }}
        />
      </div>
    );
  }

  const header = (
    <PageHeader
      eyebrow="Pipeline"
      title={data.selectedJob.title}
      description={`Pipeline for ${data.selectedJob.status} job.`}
      actions={
        data.stages.length > 0 ? (
          <PipelineViewToggle jobId={data.selectedJob.id} view={view} />
        ) : undefined
      }
    />
  );

  if (data.stages.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <PipelineJobSelect jobs={data.jobs} selectedJobId={data.selectedJob.id} />
        <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          This job has no pipeline stages yet.
        </p>
      </div>
    );
  }

  if (data.applications.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <PipelineJobSelect jobs={data.jobs} selectedJobId={data.selectedJob.id} />
        <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          No candidates have applied to this job yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      {view === "list" ? (
        <PipelineList
          key={`list-${data.selectedJob.id}`}
          jobs={data.jobs}
          selectedJob={data.selectedJob}
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
