"use server";

import { z } from "zod";

import { emptySearchResults, searchWorkspace, type SearchResults } from "./data";

const querySchema = z.string().min(1).max(100);

/** Workspace-scoped quick search over jobs and candidates for the ⌘K palette. */
export async function searchWorkspaceAction(
  rawQuery: string,
): Promise<SearchResults> {
  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return emptySearchResults;
  }

  return searchWorkspace(parsed.data);
}
