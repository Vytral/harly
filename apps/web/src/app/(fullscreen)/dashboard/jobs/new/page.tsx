import { createJobAction } from "@/features/jobs/actions";
import { listWorkspaceDepartments } from "@/features/jobs/data";
import { getCareerPageData } from "@/features/career-page/data";
import { JobForm } from "@/features/jobs/JobForm";
import { getWorkspaceAiStatus } from "@/lib/ai/config";
import { isAiUsable } from "@/lib/ai/availability-shared";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const t = await getTranslations("jobs.form");
  const { organization: workspace } = await getWorkspaceContext();
  const [departments, careerPageData, aiStatus] = await Promise.all([
    listWorkspaceDepartments(),
    getCareerPageData(workspace.slug),
    getWorkspaceAiStatus(workspace.id),
  ]);

  return (
    <JobForm
      action={createJobAction}
      submitLabel={t("publish")}
      departments={departments}
      aiConfigured={isAiUsable(aiStatus)}
      previewWorkspace={careerPageData?.workspace ?? null}
      previewConfig={careerPageData?.config ?? null}
    />
  );
}
