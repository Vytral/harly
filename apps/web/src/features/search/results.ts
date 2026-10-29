import type { Permission } from "@/features/workspaces/permissions";

import type { SearchRange } from "./query";

/**
 * Result shapes shared by the server search and the palette. Kept free of
 * server-only imports so client code and unit tests can use them directly.
 */

export const SEARCH_GROUPS = [
  "jobs",
  "candidates",
  "applications",
  "tasks",
  "people",
] as const;

export type SearchGroupKey = (typeof SEARCH_GROUPS)[number];

/**
 * The permission each group needs. A group the caller lacks is omitted, so no
 * candidate name, email or application leaves the server without candidate access.
 */
export const SEARCH_GROUP_PERMISSION: Record<SearchGroupKey, Permission> = {
  jobs: "jobs:view",
  candidates: "candidates:view",
  applications: "candidates:view",
  tasks: "tasks:read",
  people: "members:read",
};

export type WorkspaceSearchHit = {
  group: SearchGroupKey;
  id: string;
  /** Display text that is matched and highlighted (job title, candidate name, ...). */
  primary: string;
  secondary: string | null;
  href: string;
  avatarUrl: string | null;
  highlight: SearchRange[];
};

export type WorkspaceSearchGroup = {
  hits: WorkspaceSearchHit[];
  /** More matches exist beyond `hits`; `seeAllHref` shows them. */
  hasMore: boolean;
  seeAllHref: string;
};

export type WorkspaceSearchResults = {
  /** Normalized query these results answer. */
  query: string;
  /** Only groups the caller may see are present. A missing group is never an error. */
  groups: Partial<Record<SearchGroupKey, WorkspaceSearchGroup>>;
  /** Full candidate-list search for this query, or null when the caller cannot view candidates. */
  allResultsHref: string | null;
};

export function emptyWorkspaceSearchResults(query = ""): WorkspaceSearchResults {
  return { query, groups: {}, allResultsHref: null };
}
