export const BUILDER_SEARCH_PAGE_SIZE = 20;

export const BUILDER_SEARCH_KINDS = [
  "jobs",
  "members",
  "templates",
  "documents",
  "interviews",
  "tags",
  "candidates",
  "stages",
] as const;

export type BuilderSearchKind = (typeof BUILDER_SEARCH_KINDS)[number];

export type BuilderSearchItem = {
  id: string;
  label: string;
  hint?: string;
};

export function sanitizeSearchQuery(query: string): string {
  return query.trim().slice(0, 80).replace(/[%_]/g, "");
}
