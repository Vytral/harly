import "server-only";

import { getWorkspaceEsignConfig, type EsignConfig } from "@/lib/esign/config";
import { trustedDocusealArtifactUrl } from "@/lib/esign/url-security";
import { safeFetchHttp } from "@/lib/ssrf";

/** Alias so downstream modules can type a client context without importing config. */
export type EsignConfigLike = EsignConfig;

/**
 * DocuSeal REST client — plain fetch, mirroring lib/outlook/client.ts. No SDK
 * dependency. Auth is a static API token in the `X-Auth-Token` header against
 * the workspace's self-hosted instance (`${baseUrl}/api`). Replaces the DocuSign
 * OAuth/envelope client; the signing domain tables are provider-neutral so only
 * this transport layer differs.
 */

const AUTH_HEADER = "X-Auth-Token";

/** JSON fetch wrapper. Throws on non-2xx with the body for diagnosis. */
async function docusealFetch<T>(
  ctx: EsignConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await safeFetchHttp(`${ctx.apiUrl}${path}`, {
    ...init,
    headers: {
      [AUTH_HEADER]: ctx.apiToken,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DocuSeal API ${res.status}: ${body.slice(0, 500)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Resolve a usable client context (decrypted token + normalized URLs) for a
 * workspace, or null when the integration is disabled / unconfigured. Kept as a
 * thin re-export of the config resolver so callers import a single "context"
 * concept, matching freshDocuSignContext's old shape.
 */
export async function freshEsignContext(
  workspaceId: string,
): Promise<EsignConfig | null> {
  return getWorkspaceEsignConfig(workspaceId);
}

// ---- Submissions -----------------------------------------------------------

export type DocusealSubmitter = {
  id: number;
  submission_id?: number;
  uuid: string;
  email: string | null;
  slug: string;
  name: string | null;
  role: string | null;
  status: string | null;
  external_id: string | null;
  completed_at: string | null;
  declined_at: string | null;
  /** Hosted signing URL for this submitter (`${baseUrl}/s/{slug}`). */
  embed_src?: string;
};

export type DocusealSubmission = {
  id: number;
  slug?: string;
  status?: string;
  completed_at?: string | null;
  archived_at?: string | null;
  audit_log_url?: string | null;
  combined_document_url?: string | null;
  submitters: DocusealSubmitter[];
  documents?: Array<{ name: string; url: string }>;
};

/** One signer party on a submission. `role` must match the field tag's role. */
export type CreateSubmitterInput = {
  role: string;
  email: string;
  name?: string;
  external_id?: string;
  /** false → no DocuSeal email; the app drives delivery (embedded/portal flow). */
  send_email?: boolean;
  completed_redirect_url?: string;
  metadata?: Record<string, string>;
};

/** Pixel-independent field placement (fractions of page w/h), for tagless PDFs. */
export type DocusealFieldArea = {
  x: number;
  y: number;
  w: number;
  h: number;
  page: number;
};

export type DocusealPdfField = {
  name: string;
  type?: "signature" | "date" | "text" | "initials";
  role?: string;
  required?: boolean;
  areas?: DocusealFieldArea[];
};

export type CreateSubmissionFromHtmlInput = {
  name?: string;
  documents: Array<{ name?: string; html: string; size?: string }>;
  submitters: CreateSubmitterInput[];
  send_email?: boolean;
  expire_at?: string;
  message?: { subject?: string; body?: string };
};

export type CreateSubmissionFromPdfInput = {
  name?: string;
  documents: Array<{ name: string; file: string; fields?: DocusealPdfField[] }>;
  submitters: CreateSubmitterInput[];
  send_email?: boolean;
  expire_at?: string;
  message?: { subject?: string; body?: string };
};

/**
 * POST /submissions/html — build a one-off signable document from HTML. The
 * signature placement comes from `<signature-field role="...">` tags embedded in
 * the HTML. Returns the created submission (id + submitters w/ signing slugs).
 */
export async function createSubmissionFromHtml(
  ctx: EsignConfig,
  input: CreateSubmissionFromHtmlInput,
): Promise<DocusealSubmission> {
  return normalizeSubmissionResponse(
    await docusealFetch<DocusealSubmission | DocusealSubmitter[]>(
      ctx,
      "/submissions/html",
      { method: "POST", body: JSON.stringify(input) },
    ),
  );
}

/**
 * POST /submissions/pdf — send an existing PDF for signature. Fields come from
 * `{{Field;role=...;type=signature}}` text tags in the PDF, or from an explicit
 * `fields[].areas` placement when the PDF has no tags.
 */
export async function createSubmissionFromPdf(
  ctx: EsignConfig,
  input: CreateSubmissionFromPdfInput,
): Promise<DocusealSubmission> {
  return normalizeSubmissionResponse(
    await docusealFetch<DocusealSubmission | DocusealSubmitter[]>(
      ctx,
      "/submissions/pdf",
      { method: "POST", body: JSON.stringify(input) },
    ),
  );
}

/** GET /submissions/{id} — full submission incl. status + submitters + docs. */
export async function getSubmission(
  ctx: EsignConfig,
  submissionId: string | number,
): Promise<DocusealSubmission> {
  return docusealFetch<DocusealSubmission>(
    ctx,
    `/submissions/${encodeURIComponent(String(submissionId))}`,
  );
}

/** GET /submissions/{id}/documents — signed PDFs once completed. */
export async function getSubmissionDocuments(
  ctx: EsignConfig,
  submissionId: string | number,
  merge = true,
): Promise<{ id: number; documents: Array<{ name: string; url: string }> }> {
  return docusealFetch(
    ctx,
    `/submissions/${encodeURIComponent(String(submissionId))}/documents?merge=${merge ? "true" : "false"}`,
  );
}

/** DELETE /submissions/{id} — archive (the DocuSign "void" analogue). */
export async function archiveSubmission(
  ctx: EsignConfig,
  submissionId: string | number,
): Promise<void> {
  await docusealFetch<void>(
    ctx,
    `/submissions/${encodeURIComponent(String(submissionId))}`,
    { method: "DELETE" },
  );
}

/** Archive a submission and treat a remote already-archived response as success. */
export async function archiveSubmissionIdempotent(
  ctx: EsignConfig,
  submissionId: string | number,
): Promise<boolean> {
  try {
    await archiveSubmission(ctx, submissionId);
    return true;
  } catch {
    try {
      const current = await getSubmission(ctx, submissionId);
      return Boolean(current.archived_at) || current.status === "archived";
    } catch {
      return false;
    }
  }
}

/**
 * Download a signed/audit PDF from its DocuSeal URL. On self-hosted instances
 * the file host is the same origin as the API, so no extra auth is required for
 * the blob URL — but we still send the token to be safe on protected hosts.
 */
export async function downloadDocusealFile(
  ctx: EsignConfig,
  url: string,
): Promise<Buffer> {
  const trustedUrl = trustedDocusealArtifactUrl(ctx, url);
  if (!trustedUrl) {
    throw new Error("DocuSeal returned an untrusted artifact URL.");
  }

  // Do not follow a provider-controlled redirect while carrying the workspace
  // bearer token. A redirect is retried only if a future provider adapter
  // explicitly validates its destination first.
  const res = await safeFetchHttp(trustedUrl, {
    redirect: "manual",
    headers: { [AUTH_HEADER]: ctx.apiToken },
  });
  if (res.status >= 300 && res.status < 400) {
    throw new Error("DocuSeal artifact URL redirected unexpectedly.");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `DocuSeal file download ${res.status}: ${body.slice(0, 300)}`,
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Sender-facing submission link in the DocuSeal admin UI. */
export function getDocusealSubmissionUrl(
  baseUrl: string,
  submissionId: string | number,
) {
  return `${baseUrl}/submissions/${encodeURIComponent(String(submissionId))}`;
}

/**
 * The /submissions/html and /submissions/pdf endpoints return the submission
 * object, but the base /submissions endpoint returns a bare submitters array.
 * Normalize both into a submission shape so callers see one type.
 */
function normalizeSubmissionResponse(
  data: DocusealSubmission | DocusealSubmitter[],
): DocusealSubmission {
  if (Array.isArray(data)) {
    const submissionId = data[0]?.submission_id;
    if (submissionId === undefined) {
      throw new Error("DocuSeal returned no submission id.");
    }
    return { id: submissionId, submitters: data };
  }
  return data;
}
