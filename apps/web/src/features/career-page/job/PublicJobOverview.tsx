import type { getPublicJobDetail } from "@/features/jobs/data";

import { jobPostingJsonLd, serializeJsonLd } from "../seo";
import { JobChrome } from "./JobChrome";
import { JobOverviewBody } from "./JobOverviewBody";

type PublicJobDetail = NonNullable<Awaited<ReturnType<typeof getPublicJobDetail>>>;

/**
 * The public job overview, shared by the root site (`/jobs/[slug]`) and the
 * workspace board (`/board/[workspaceSlug]/jobs/[jobSlug]`) so both emit the
 * same markup and the same JobPosting structured data.
 */
export function PublicJobOverview({
  detail,
  boardRoot,
  portalEnabled,
}: {
  detail: PublicJobDetail;
  boardRoot: string;
  portalEnabled: boolean;
}) {
  const { job, workspace, config } = detail;
  const jsonLd = config.seo.indexable ? jobPostingJsonLd(workspace, job) : null;

  return (
    <>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
        />
      ) : null}
      <JobChrome
        config={config}
        workspace={workspace}
        job={job}
        boardRoot={boardRoot}
        activeTab="overview"
        portalEnabled={portalEnabled}
      >
        <JobOverviewBody
          job={job}
          process={config.process}
          accent={config.theme.accent ?? workspace.primaryColor ?? undefined}
          rounded={config.theme.rounded}
        />
      </JobChrome>
    </>
  );
}
