"use server";

import { z } from "zod";

import { createLogger } from "@/lib/logger";

import { RECENTS_LIMIT } from "./recents";
import { normalizeSearchQuery } from "./query";
import {
  SEARCH_GROUPS,
  emptyWorkspaceSearchResults,
  type WorkspaceSearchResults,
} from "./results";
import {
  resolveSearchActor,
  searchWorkspaceForActor,
  visibleRecentRefsForActor,
  type RecentRef,
} from "./workspace-search";

export type WorkspaceSearchActionResult =
  | { ok: true; results: WorkspaceSearchResults }
  | { ok: false; error: string };

const querySchema = z.string().max(500);

export type RecentsViewerActionResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

export type VisibleRecentsActionResult =
  | { ok: true; visible: RecentRef[] }
  | { ok: false; error: string };

const recentRefsSchema = z
  .array(
    z.object({
      group: z.enum(SEARCH_GROUPS),
      id: z.string().min(1).max(100),
    }),
  )
  .max(RECENTS_LIMIT);

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
    // Drizzle errors carry the bound parameters, which are the typed text.
    log.error({ failure: safeFailure(error) }, "workspace search failed");
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

/**
 * The signed-in viewer's id. The palette keys its per-user recents by it; the
 * page does not pass the id down, so the palette asks once when it mounts.
 */
export async function recentsViewerAction(): Promise<RecentsViewerActionResult> {
  try {
    const actor = await resolveSearchActor();
    return { ok: true, userId: actor.userId };
  } catch (error) {
    if (isRedirectSignal(error)) throw error;
    log.error({ failure: safeFailure(error) }, "recents viewer failed");
    return { ok: false, error: "Search didn't load. Try again." };
  }
}

/**
 * Which saved recents the viewer may still open, judged against their current
 * permissions and scope. Anything else is dropped from the palette.
 */
export async function visibleRecentsAction(
  refs: unknown,
): Promise<VisibleRecentsActionResult> {
  const parsed = recentRefsSchema.safeParse(refs);
  if (!parsed.success) {
    return { ok: false, error: "Recent searches could not be checked." };
  }
  if (parsed.data.length === 0) return { ok: true, visible: [] };

  try {
    const actor = await resolveSearchActor();
    const visible = await visibleRecentRefsForActor(actor, parsed.data);
    return { ok: true, visible };
  } catch (error) {
    if (isRedirectSignal(error)) throw error;
    log.error({ failure: safeFailure(error) }, "recents check failed");
    return { ok: false, error: "Recent searches could not be checked." };
  }
}

/** Error class and database code only: messages and parameters can contain typed text. */
function safeFailure(error: unknown): { errorClass: string; code?: string } {
  const errorClass =
    error instanceof Error ? error.constructor.name : typeof error;
  const cause =
    typeof error === "object" && error !== null && "cause" in error
      ? (error as { cause?: unknown }).cause
      : undefined;
  const code = [error, cause]
    .map((source) =>
      typeof source === "object" && source !== null && "code" in source
        ? (source as { code?: unknown }).code
        : undefined,
    )
    .find((value): value is string => typeof value === "string" && /^[0-9A-Z]{5}$/.test(value));
  return code ? { errorClass, code } : { errorClass };
}
