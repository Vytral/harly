import { McpToolError } from "../../types";

// Pure helpers for the candidates and pipeline MCP tools: error mapping, text
// hygiene, URL building and result shaping. No database or session access here,
// so everything is unit-testable (see candidates.test.ts).

export function clampLimit(limit: number | undefined, fallback = 25, max = 100): number {
  return Math.min(Math.max(Math.trunc(limit ?? fallback), 1), max);
}

const INVISIBLE =
  // C0/C1 controls except \t \n, zero-width and bidi marks, BOM, Unicode tag characters.
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]|\udb40[\udc00-\udc7f]/g;

/**
 * Candidate-supplied text (resume, summary, form answers) is returned to an
 * external model, so strip characters used to hide instructions and cap length.
 */
export function cleanText(value: string | null | undefined, max = 5000): string | null {
  if (value == null) return null;
  const cleaned = value.replace(INVISIBLE, "").replace(/\r\n?/g, "\n").trim();
  if (cleaned.length === 0) return null;
  return cleaned.length > max ? `${cleaned.slice(0, max - 1).trimEnd()}…` : cleaned;
}

export function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function personName(first: string | null | undefined, last: string | null | undefined): string {
  return `${first ?? ""} ${last ?? ""}`.trim();
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

function digestOf(error: unknown): string {
  return typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string"
    ? error.digest
    : "";
}

/** Classify a plain failure message from the existing server actions. */
export function classifyFailure(message: string): McpToolError["code"] {
  if (/do(es)? not have (permission|access)|not assigned to (this|a) job|workspace-wide|access denied/i.test(message)) {
    return "forbidden";
  }
  if (/not found|no longer available|is not in the pool/i.test(message)) return "not_found";
  if (/already (exists|has|in|being)|already processed|conflict|changed|concurrent|try again/i.test(message)) {
    return "conflict";
  }
  if (/not configured|unavailable|too many/i.test(message)) return "unavailable";
  return "invalid_input";
}

/**
 * Turn what the existing server actions throw into an McpToolError. Anything
 * unrecognised is rethrown so the runtime reports it as an internal error.
 */
export function mapActionError(error: unknown): never {
  if (error instanceof McpToolError) throw error;
  const digest = digestOf(error);
  if (digest.includes("NEXT_HTTP_ERROR_FALLBACK;404") || digest === "NEXT_NOT_FOUND") {
    throw new McpToolError("Not found, or outside your access.", "not_found");
  }
  if (digest.startsWith("NEXT_")) throw error;
  // @harly/api ApiError (used by the shared services) carries a code.
  if (error instanceof Error && error.name === "ApiError") {
    const code = (error as Error & { code?: string }).code;
    const mapped: McpToolError["code"] =
      code === "not_found"
        ? "not_found"
        : code === "forbidden" || code === "unauthorized"
          ? "forbidden"
          : code === "conflict"
            ? "conflict"
            : "invalid_input";
    throw new McpToolError(error.message, mapped);
  }
  if (error instanceof Error) {
    const code = classifyFailure(error.message);
    const recognised =
      code !== "invalid_input" ||
      /must|invalid|cannot|required|only|at least|too long|member of this workspace|choose|not assigned/i.test(error.message);
    if (recognised) throw new McpToolError(error.message, code);
  }
  throw error;
}

/** `{ success: false, error }` results from the actions become tool errors. */
export function failure(message: string | undefined, fallback: string): never {
  const text = message?.trim() || fallback;
  throw new McpToolError(text, classifyFailure(text));
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

export function candidateUrl(origin: string, candidateId: string, applicationId?: string): string {
  const base = `${origin}/dashboard/candidates/${candidateId}`;
  return applicationId ? `${base}?application=${applicationId}` : base;
}

export function pipelineUrl(origin: string, jobId: string): string {
  return `${origin}/dashboard/pipeline?job=${jobId}`;
}

export function talentPoolUrl(origin: string): string {
  return `${origin}/dashboard/talent-pool`;
}

/** Absolute app URL for a stored file path like `/api/storage/file?key=...`. */
export function appFileUrl(origin: string, fileUrl: string): string | null {
  if (!fileUrl.startsWith("/api/storage/file?")) return null;
  return `${origin}${fileUrl}`;
}

// ---------------------------------------------------------------------------
// Pagination over the page-based candidate directory
// ---------------------------------------------------------------------------

export const DIRECTORY_PAGE_SIZE = 100;

/**
 * The directory loads fixed pages (10..100 rows). To serve an arbitrary
 * `offset`/`limit` window, load the pages that overlap it and slice.
 */
export function directoryWindow(offset: number, limit: number, pageSize = DIRECTORY_PAGE_SIZE) {
  const firstPage = Math.floor(offset / pageSize) + 1;
  const skip = offset % pageSize;
  const pages = skip + limit > pageSize ? [firstPage, firstPage + 1] : [firstPage];
  return { pageSize, pages, skip };
}

// ---------------------------------------------------------------------------
// Result shaping
// ---------------------------------------------------------------------------

type DirectoryRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  location: string | null;
  avatarUrl: string | null;
  applicationCount: number;
  inPool: boolean;
  hasOpenPrivacyRequest: boolean;
  isReferred: boolean;
  isFeaturedReferral: boolean;
  updatedAt: Date;
  tags: string[];
  latestApplication: {
    applicationId: string;
    jobId: string;
    jobTitle: string;
    department: string | null;
    currentStageName: string | null;
    status: string;
    source: string | null;
    appliedAt: Date;
  } | null;
};

export function serializeDirectoryRow(row: DirectoryRow, origin: string) {
  const latest = row.latestApplication;
  return {
    id: row.id,
    name: personName(row.firstName, row.lastName),
    email: row.email,
    phone: row.phone,
    location: row.location,
    tags: row.tags,
    applicationCount: row.applicationCount,
    inTalentPool: row.inPool,
    isReferred: row.isReferred,
    isFeaturedReferral: row.isFeaturedReferral,
    hasOpenPrivacyRequest: row.hasOpenPrivacyRequest,
    latestApplication: latest
      ? {
          applicationId: latest.applicationId,
          jobId: latest.jobId,
          jobTitle: latest.jobTitle,
          department: latest.department,
          stage: latest.currentStageName,
          status: latest.status,
          source: latest.source,
          appliedAt: iso(latest.appliedAt),
        }
      : null,
    updatedAt: iso(row.updatedAt),
    url: candidateUrl(origin, row.id, latest?.applicationId),
  };
}

type EvaluationLike = {
  id: string;
  applicationId: string;
  source: "ai" | "rules";
  score: number;
  recommendation: string;
  summary: string;
  strengths: string[];
  gaps: string[];
  confidence: number | null;
  evidenceCoverage: number | null;
  requiresHumanReview: boolean;
  usedResume: boolean;
  updatedAt: string;
  modelId?: string;
  criteria?: Array<{
    label: string;
    score: number | null;
    evidence: string | null;
    status?: string;
  }>;
};

/** Compact one-line score used inside application and candidate summaries. */
export function evaluationBrief(evaluation: EvaluationLike | undefined | null) {
  if (!evaluation) return null;
  return {
    score: evaluation.score,
    recommendation: evaluation.recommendation,
    source: evaluation.source,
    requiresHumanReview: evaluation.requiresHumanReview,
    updatedAt: evaluation.updatedAt,
  };
}

/** The evaluation shown for an application (profile lists newest first). */
export function pickEvaluation<T extends { applicationId: string }>(
  evaluations: readonly T[],
  applicationId: string,
): T | undefined {
  return evaluations.find((evaluation) => evaluation.applicationId === applicationId);
}

/** Full evaluation detail. Summary, strengths, gaps and evidence come from model output over resume text. */
export function serializeEvaluation(evaluation: EvaluationLike) {
  return {
    evaluationId: evaluation.id,
    applicationId: evaluation.applicationId,
    score: evaluation.score,
    recommendation: evaluation.recommendation,
    source: evaluation.source,
    confidence: evaluation.confidence,
    evidenceCoverage: evaluation.evidenceCoverage,
    requiresHumanReview: evaluation.requiresHumanReview,
    usedResume: evaluation.usedResume,
    model: evaluation.modelId ?? null,
    updatedAt: evaluation.updatedAt,
    untrusted_text: {
      summary: cleanText(evaluation.summary, 2000),
      strengths: evaluation.strengths.map((item) => cleanText(item, 400)).filter(Boolean),
      gaps: evaluation.gaps.map((item) => cleanText(item, 400)).filter(Boolean),
      criteria: (evaluation.criteria ?? []).map((criterion) => ({
        label: criterion.label,
        score: criterion.score,
        status: criterion.status ?? null,
        evidence: cleanText(criterion.evidence, 400),
      })),
    },
  };
}

type ConsentRow = {
  consentType: "data_processing" | "marketing" | "ai_evaluation";
  granted: boolean;
  withdrawnAt: Date | null;
  createdAt: Date;
};

/** Latest consent per type. A withdrawn consent reads as not granted. */
export function summarizeConsent(rows: readonly ConsentRow[]) {
  const latest = new Map<string, ConsentRow>();
  for (const row of rows) {
    const current = latest.get(row.consentType);
    if (!current || row.createdAt.getTime() > current.createdAt.getTime()) latest.set(row.consentType, row);
  }
  const entry = (type: ConsentRow["consentType"]) => {
    const row = latest.get(type);
    if (!row) return { status: "not_recorded" as const, recordedAt: null, withdrawnAt: null };
    const withdrawn = row.withdrawnAt !== null;
    return {
      status: withdrawn ? ("withdrawn" as const) : row.granted ? ("granted" as const) : ("declined" as const),
      recordedAt: iso(row.createdAt),
      withdrawnAt: iso(row.withdrawnAt),
    };
  };
  return {
    dataProcessing: entry("data_processing"),
    aiEvaluation: entry("ai_evaluation"),
    marketing: entry("marketing"),
  };
}

type StageRef = { id: string; name: string };

/**
 * Pick a stage of the application's job by id or (case-insensitive) name.
 * Names must match exactly one active stage; ambiguity is an error.
 */
export function resolveStageRef<T extends StageRef>(
  stages: readonly T[],
  ref: { stageId?: string | undefined; stageName?: string | undefined },
): T {
  if (ref.stageId) {
    const found = stages.find((stage) => stage.id === ref.stageId);
    if (!found) {
      throw new McpToolError(
        `Stage ${ref.stageId} is not an active stage of this job. Use pipeline_list_stages to see valid stage ids.`,
        "not_found",
      );
    }
    return found;
  }
  const wanted = ref.stageName?.trim().toLocaleLowerCase();
  if (!wanted) throw new McpToolError("Provide stageId or stageName.", "invalid_input");
  const matches = stages.filter((stage) => stage.name.trim().toLocaleLowerCase() === wanted);
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    throw new McpToolError(`More than one stage is named "${ref.stageName}". Use stageId.`, "conflict");
  }
  throw new McpToolError(
    `No active stage named "${ref.stageName}" in this job. Valid stages: ${stages.map((stage) => stage.name).join(", ")}.`,
    "not_found",
  );
}

/** Marks agent-authored notes so humans can tell them apart (ADR-007 D8). */
export function noteWithOrigin(body: string, clientName: string, max = 5000): string {
  const suffix = `\n\n(via MCP: ${clientName.replace(/[\r\n]+/g, " ").trim().slice(0, 60) || "AI client"})`;
  const trimmed = body.trim();
  const room = max - suffix.length;
  const text = trimmed.length > room ? `${trimmed.slice(0, Math.max(room - 1, 0)).trimEnd()}…` : trimmed;
  return `${text}${suffix}`;
}
