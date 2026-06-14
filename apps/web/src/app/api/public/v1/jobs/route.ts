import { NextResponse } from "next/server";

import { listOpenJobsForWorkspaceSlug } from "@/features/jobs/data";
import { serializePublicJob } from "@/features/jobs/service";
import { resolvePublicWorkspace } from "@/server/api/public";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";
import { apiOk, corsPreflight, withApi } from "@/server/api/respond";

export const runtime = "nodejs";

/** GET /api/public/v1/jobs — list a workspace's open jobs (CORS-open). */
export const GET = withApi(async (request) => {
  enforceRateLimit(`public:jobs:${clientIp(request)}`, {
    limit: 120,
    windowMs: 60_000,
  });

  const workspace = await resolvePublicWorkspace(request, "jobs:read");
  const { jobs } = await listOpenJobsForWorkspaceSlug(workspace.slug);

  // Light client-side filters so an embed can render facets without extra calls.
  const url = new URL(request.url);
  const department = url.searchParams.get("department")?.toLowerCase();
  const location = url.searchParams.get("location")?.toLowerCase();
  const workplaceType = url.searchParams.get("workplaceType");
  const query = url.searchParams.get("q")?.toLowerCase();

  const filtered = jobs.filter((job) => {
    if (department && job.department?.toLowerCase() !== department) return false;
    if (location && !job.location?.toLowerCase().includes(location)) return false;
    if (workplaceType && job.workplaceType !== workplaceType) return false;
    if (query && !`${job.title} ${job.description}`.toLowerCase().includes(query))
      return false;
    return true;
  });

  return apiOk(
    {
      workspace: { slug: workspace.slug },
      jobs: filtered.map((job) => serializePublicJob(job, workspace.slug)),
    },
    { cors: true },
  ) as NextResponse;
}, { cors: true });

export function OPTIONS() {
  return corsPreflight();
}
