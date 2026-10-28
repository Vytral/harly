"use server";

import { z } from "zod";

import { createLogger } from "@/lib/logger";

import { normalizeSearchQuery } from "./query";
import {
  emptyWorkspaceSearchResults,
  type WorkspaceSearchResults,
} from "./results";
import { resolveSearchActor, searchWorkspaceForActor } from "./workspace-search";

export type WorkspaceSearchActionResult =
  | { ok: true; results: WorkspaceSearchResults }
  | { ok: false; error: string };

const querySchema = z.string().max(500);

const log = createLogger("workspace-search");

/**
 * Grouped workspace search for the ⌘K palette. Groups the caller may not see
 * are omitted rather than failing. Never throws to the client: failures come
 * back as `{ ok: false }`, and the auth redirect still applies to signed-out users.
 */
export async function searchWorkspaceAction(
  rawQuery: string,
): Promise<WorkspaceSearchActionResult> {
  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return { ok: false, error: "That search is too long. Shorten it and try again." };
  }
  const query = normalizeSearchQuery(parsed.data);
  if (!query) {
    return { ok: true, results: emptyWorkspaceSearchResults("") };
  }

  try {
    const actor = await resolveSearchActor();
    const results = await searchWorkspaceForActor(actor, query.text);
    return { ok: true, results };
  } catch (error) {
    if (isRedirectSignal(error)) throw error;
    log.error({ err: error }, "workspace search failed");
    return { ok: false, error: "Search didn't load. Try again." };
  }
}

/** Next.js signals redirects by throwing; those must reach the framework. */
function isRedirectSignal(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}
