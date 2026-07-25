import { createJobAction } from "@/features/jobs/actions";
import { listWorkspaceDepartments } from "@/features/jobs/data";
import { getCareerPageData } from "@/features/career-page/data";
import { JobForm } from "@/features/jobs/JobForm";
import { getWorkspaceContext } from "@/features/workspaces/context";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const { organization: workspace } = await getWorkspaceContext();
  const [departments, careerPageData] = await Promise.all([
    listWorkspaceDepartments(),
    getCareerPageData(workspace.slug),
  ]);

  return (
    <JobForm
      action={createJobAction}
      submitLabel="Publish"
      departments={departments}
      previewWorkspace={careerPageData?.workspace ?? null}
      previewConfig={careerPageData?.config ?? null}
    />
  );
}
