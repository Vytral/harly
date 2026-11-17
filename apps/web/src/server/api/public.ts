import "server-only";

import { eq } from "drizzle-orm";

import { ApiError, type ApiScope } from "@harly/api";
import { db, organization } from "@harly/db";

import { getPublicWorkspace } from "@/lib/public-workspace";
import { authenticateApiKey, type ApiKeyContext } from "./auth";

/**
 * Resolve the workspace a public request targets. Two modes:
 *  - an API key is present (publishable `pk_` in a header or `?pk=`) → use its
 *    workspace, and (optionally) assert a scope.
 *  - otherwise use the public workspace (see `getPublicWorkspace`).
 */
export type PublicWorkspace = {
  workspaceId: string;
  slug: string;
  key: ApiKeyContext | null;
};

function hasKey(request: Request): boolean {
  const url = new URL(request.url);
  return (
    Boolean(request.headers.get("authorization")) ||
    Boolean(request.headers.get("x-api-key")) ||
    Boolean(url.searchParams.get("pk"))
  );
}

export async function resolvePublicWorkspace(
  request: Request,
  requiredScope?: ApiScope,
): Promise<PublicWorkspace> {
  if (hasKey(request)) {
    const key = await authenticateApiKey(request, requiredScope);
    const [org] = await db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, key.workspaceId))
      .limit(1);
    if (!org) throw ApiError.notFound("Workspace not found.");
    return { workspaceId: key.workspaceId, slug: org.slug, key };
  }

  // Same resolver as the public site, so the API and the pages always agree on
  // which workspace a key-less request targets.
  const org = await getPublicWorkspace();
  if (!org) throw ApiError.notFound("Workspace not found.");

  return { workspaceId: org.id, slug: org.slug, key: null };
}
