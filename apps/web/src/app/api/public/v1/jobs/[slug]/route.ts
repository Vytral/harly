import { getPublicJobDetail } from "@/features/jobs/data";
import { getPublicJobApplicationContext } from "@/features/applications/data";
import { serializePublicJob } from "@/features/jobs/service";
import { ApiError } from "@harly/api";
import { resolvePublicWorkspace } from "@/server/api/public";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";
import { apiOk, corsPreflight, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

type Context = { params: Promise<{ slug: string }> };

/** GET /api/public/v1/jobs/{slug} , job detail + application config (CORS-open). */
export const GET = withApi(async (request, context) => {
  enforceRateLimit(`public:job:${clientIp(request)}`, {
    limit: 120,
    windowMs: 60_000,
  });

  const { slug } = await (context as Context).params;
  const workspace = await resolvePublicWorkspace(request, "jobs:read");

  const detail = await getPublicJobDetail({
    jobSlug: slug,
    workspaceSlug: workspace.slug,
  });
  if (!detail) throw ApiError.notFound("Job not found or not open.");

  const applicationContext = await getPublicJobApplicationContext({
    jobSlug: slug,
    workspaceSlug: workspace.slug,
  });

  return apiOk(
    {
      job: serializePublicJob(detail.job, workspace.slug),
      applicationConfig: applicationContext?.applicationConfig ?? null,
    },
    { cors: true },
  );
}, { cors: true });

export function OPTIONS() {
  return corsPreflight();
}
