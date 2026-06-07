import { PageHeader } from "@/components/ui/PageHeader";
import { createJobAction } from "@/features/jobs/actions";
import { listWorkspaceDepartments } from "@/features/jobs/data";
import { JobForm } from "@/features/jobs/JobForm";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const departments = await listWorkspaceDepartments();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="New job"
        title="Create an opening"
        description="New jobs start as drafts and receive the default hiring stages automatically."
      />
      <JobForm
        action={createJobAction}
        submitLabel="Create draft job"
        departments={departments}
      />
    </div>
  );
}
