/**
 * Where a candidate page was opened from, carried in its URL so the pager
 * (previous / next) walks that same list and "Back" returns to it with its
 * filters. Pure and client-safe: the only place these params are encoded or
 * decoded, so links, the pager and the server page cannot drift apart.
 *
 *   Review queue   /dashboard/candidates/<id>?queue=review&application=<appId>
 *   Directory      /dashboard/candidates/<id>?from=candidates&q=ana&stage=Interview
 *                  (no params at all = the unfiltered directory)
 *   Pipeline       /dashboard/candidates/<id>?from=pipeline&jobId=<job>&stage=<stageId>&q=ana&view=board&application=<appId>
 */

export const DIRECTORY_FILTER_KEYS = [
  "q",
  "dept",
  "role",
  "stage",
  "status",
  "source",
  "tag",
  "sort",
] as const;
export type DirectoryFilterKey = (typeof DIRECTORY_FILTER_KEYS)[number];
export type DirectoryOriginFilters = Partial<Record<DirectoryFilterKey, string>>;

const DIRECTORY_STATUSES = ["active", "hired", "rejected", "withdrawn"] as const;
/** "recent" is the directory default, so it is never written to the URL. */
const DIRECTORY_SORTS = ["oldest", "modified", "name"] as const;

export type CandidateOrigin =
  | { kind: "review" }
  | { kind: "candidates"; filters: DirectoryOriginFilters }
  | {
      kind: "pipeline";
      jobId: string;
      /** Stage id the list was filtered to. */
      stage?: string;
      q?: string;
      view?: "board";
    };

export type PipelineOrigin = Extract<CandidateOrigin, { kind: "pipeline" }>;

export type CandidateNavigation = {
  origin: CandidateOrigin;
  /** The application the origin row stood for (queue and pipeline rows). */
  applicationId: string | null;
};

export const REVIEW_ORIGIN: CandidateOrigin = { kind: "review" };
export const DIRECTORY_ORIGIN: CandidateOrigin = { kind: "candidates", filters: {} };

type ParamSource =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | null
  | undefined;

const MAX_TEXT = 100;
/** "__all__" and friends are UI sentinels for "no filter", never values. */
const SENTINEL = /^__.*__$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function read(params: ParamSource, key: string): string | undefined {
  if (!params) return undefined;
  const raw =
    params instanceof URLSearchParams
      ? params.get(key)
      : (() => {
          const value = params[key];
          return Array.isArray(value) ? value[0] : value;
        })();
  return raw ?? undefined;
}

function cleanText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/\s+/g, " ").slice(0, MAX_TEXT);
  if (!trimmed || SENTINEL.test(trimmed)) return undefined;
  return trimmed;
}

function cleanId(value: string | null | undefined): string | undefined {
  const text = cleanText(value);
  return text && UUID.test(text) ? text : undefined;
}

/** Keeps only meaningful directory filters, in a canonical form. */
export function cleanDirectoryFilters(
  input: Partial<Record<DirectoryFilterKey, string | null | undefined>>,
): DirectoryOriginFilters {
  const filters: DirectoryOriginFilters = {};
  for (const key of DIRECTORY_FILTER_KEYS) {
    const value = cleanText(input[key]);
    if (!value) continue;
    if (key === "status" && !(DIRECTORY_STATUSES as readonly string[]).includes(value)) continue;
    if (key === "sort" && !(DIRECTORY_SORTS as readonly string[]).includes(value)) continue;
    filters[key] = value;
  }
  return filters;
}

/** Directory origin from the candidates page's own params (or filter state). */
export function directoryOrigin(
  input: ParamSource | Partial<Record<DirectoryFilterKey, string | null | undefined>>,
): CandidateOrigin {
  const values: Partial<Record<DirectoryFilterKey, string | undefined>> = {};
  for (const key of DIRECTORY_FILTER_KEYS) {
    values[key] =
      input instanceof URLSearchParams
        ? read(input, key)
        : read(input as Record<string, string | string[] | undefined>, key);
  }
  return { kind: "candidates", filters: cleanDirectoryFilters(values) };
}

export function pipelineOrigin(input: {
  jobId: string;
  stage?: string | null;
  q?: string | null;
  view?: string | null;
}): PipelineOrigin {
  const origin: PipelineOrigin = {
    kind: "pipeline",
    jobId: input.jobId,
  };
  const stage = cleanId(input.stage);
  const q = cleanText(input.q);
  if (stage) origin.stage = stage;
  if (q) origin.q = q;
  if (input.view === "board") origin.view = "board";
  return origin;
}

/** Decodes a candidate page's search params. Unknown or bad input = directory. */
export function parseCandidateNavigation(params: ParamSource): CandidateNavigation {
  const applicationId = cleanId(read(params, "application")) ?? null;

  if (read(params, "queue") === "review") {
    return { origin: REVIEW_ORIGIN, applicationId };
  }

  if (read(params, "from") === "pipeline") {
    const jobId = cleanId(read(params, "jobId"));
    if (jobId) {
      return {
        origin: pipelineOrigin({
          jobId,
          stage: read(params, "stage"),
          q: read(params, "q"),
          view: read(params, "view"),
        }),
        applicationId,
      };
    }
    return { origin: DIRECTORY_ORIGIN, applicationId };
  }

  if (read(params, "from") === "candidates") {
    return { origin: directoryOrigin(params), applicationId };
  }

  return { origin: DIRECTORY_ORIGIN, applicationId };
}

/** The origin (and optional application) as a candidate page query string. */
export function candidateNavigationParams(
  origin: CandidateOrigin,
  applicationId?: string | null,
): URLSearchParams {
  const params = new URLSearchParams();
  const application = cleanId(applicationId);
  switch (origin.kind) {
    case "review":
      params.set("queue", "review");
      if (application) params.set("application", application);
      break;
    case "pipeline":
      params.set("from", "pipeline");
      params.set("jobId", origin.jobId);
      if (origin.stage) params.set("stage", origin.stage);
      if (origin.q) params.set("q", origin.q);
      if (origin.view) params.set("view", origin.view);
      if (application) params.set("application", application);
      break;
    case "candidates": {
      const filters = cleanDirectoryFilters(origin.filters);
      const keys = DIRECTORY_FILTER_KEYS.filter((key) => filters[key]);
      // The unfiltered directory is the default origin: keep its links bare.
      if (keys.length === 0) break;
      params.set("from", "candidates");
      for (const key of keys) params.set(key, filters[key]!);
      break;
    }
  }
  return params;
}

function withQuery(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** A candidate's page, opened from `origin`. */
export function candidateHref(
  candidateId: string,
  origin: CandidateOrigin = DIRECTORY_ORIGIN,
  applicationId?: string | null,
): string {
  return withQuery(
    `/dashboard/candidates/${encodeURIComponent(candidateId)}`,
    candidateNavigationParams(origin, applicationId),
  );
}

/** Where "Back" goes: the origin list, with its filters. */
export function originHref(origin: CandidateOrigin): string {
  switch (origin.kind) {
    case "review":
      return "/dashboard/candidates?queue=review";
    case "pipeline": {
      const params = new URLSearchParams({ jobId: origin.jobId });
      if (origin.view) params.set("view", origin.view);
      if (origin.stage) params.set("stage", origin.stage);
      if (origin.q) params.set("q", origin.q);
      return withQuery("/dashboard/pipeline", params);
    }
    case "candidates": {
      const filters = cleanDirectoryFilters(origin.filters);
      const params = new URLSearchParams();
      for (const key of DIRECTORY_FILTER_KEYS) {
        if (filters[key]) params.set(key, filters[key]!);
      }
      return withQuery("/dashboard/candidates", params);
    }
  }
}

/** Translator for `labels.candidates.origin`. */
export type OriginTranslator = (key: string) => string;

/** Short name of the origin list, for "3 of 12 in …" and "Back to …". */
export function originLabel(origin: CandidateOrigin, t: OriginTranslator): string {
  switch (origin.kind) {
    case "review":
      return t("review");
    case "pipeline":
      return t("pipeline");
    case "candidates":
      return Object.keys(cleanDirectoryFilters(origin.filters)).length > 0
        ? t("filteredCandidates")
        : t("candidates");
  }
}

export function originBackLabel(origin: CandidateOrigin, t: OriginTranslator): string {
  switch (origin.kind) {
    case "review":
      return t("backToReview");
    case "pipeline":
      return t("backToPipeline");
    case "candidates":
      return t("backToCandidates");
  }
}
