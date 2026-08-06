"use server";

import { z } from "zod";

import { emptySearchResults, searchWorkspace, type SearchResults } from "./data";
import {
  getRolePolicy,
  requirePermission,
} from "@/features/workspaces/permissions-server";

const querySchema = z.string().trim().min(1).max(100);

/** Workspace-scoped quick search over jobs and candidates for the ⌘K palette. */
export async function searchWorkspaceAction(
  rawQuery: string,
): Promise<SearchResults> {
  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return emptySearchResults;
  }

  // Candidate results include email, phone, headline, and avatar. Requiring
  // candidate visibility for the whole palette prevents a caller with only
  // workspace membership from using the job search as a PII oracle.
  const context = await requirePermission("candidates:view");
  const scope = (await getRolePolicy(context.organization.id, context.roleKey)).scope;
  if (
    scope.jobAccess !== "all" ||
    scope.departments.length > 0 ||
    scope.regions.length > 0
  ) {
    throw new Error("Workspace search is unavailable for scoped roles.");
  }
  return searchWorkspace(parsed.data);
}
