import { createJobAction } from "@/features/jobs/actions";
import { listWorkspaceDepartments } from "@/features/jobs/data";
import { JobForm } from "@/features/jobs/JobForm";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const departments = await listWorkspaceDepartments();

  return (
    <JobForm
      action={createJobAction}
      submitLabel="Publish"
      departments={departments}
    />
  );
}
