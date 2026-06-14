import "server-only";

import { eq } from "drizzle-orm";

import { ApiError, type ApiScope } from "@harly/api";
import { db, organization } from "@harly/db";

import { authenticateApiKey, type ApiKeyContext } from "./auth";

/**
 * Resolve the workspace a public request targets. Two modes:
 *  - an API key is present (publishable `pk_` in a header or `?pk=`) → use its
 *    workspace, and (optionally) assert a scope.
 *  - otherwise fall back to a `?workspace=<slug>` query param (zero-config embed).
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

  const slug = new URL(request.url).searchParams.get("workspace");
  if (!slug) {
    throw ApiError.badRequest(
      "Provide a `workspace` slug or a publishable API key.",
    );
  }
  const [org] = await db
    .select({ id: organization.id, slug: organization.slug })
    .from(organization)
    .where(eq(organization.slug, slug))
    .limit(1);
  if (!org) throw ApiError.notFound("Workspace not found.");

  return { workspaceId: org.id, slug: org.slug, key: null };
}
