import { TEMPLATE_VARIABLES, interpolateTemplate, type TemplateValues } from "@/features/email-templates/interpolate";
import { templateHtmlToPlainText } from "@/features/email-templates/plain-text";
import { McpToolError } from "../../types";

/**
 * Pure helpers for the messages MCP tools: shaping rows into compact JSON,
 * building deep links and translating the `{ ok:false, error }` results the
 * existing server actions return into tool errors. No database access here so
 * every function is unit testable.
 */

export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;
/** Message bodies are clipped so one long thread cannot flood the model context. */
export const MAX_BODY_CHARS = 8_000;
export const MAX_PREVIEW_CHARS = 240;
/** Attachments up to this size can be returned inline as base64. */
export const MAX_INLINE_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export function clip(value: string | null | undefined, max: number): { text: string; truncated: boolean } {
  const text = value ?? "";
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, max)}…`, truncated: true };
}

export function threadUrl(origin: string, threadId: string) {
  return `${origin}/dashboard/inbox?thread=${threadId}`;
}
export function candidateUrl(origin: string, candidateId: string) {
  return `${origin}/dashboard/candidates/${candidateId}`;
}
export function templateUrl(origin: string, templateId: string) {
  return `${origin}/dashboard/templates/${templateId}`;
}
export function attachmentUrl(origin: string, attachmentId: string) {
  return `${origin}/api/mailbox/attachments/${attachmentId}`;
}

export type ThreadRow = {
  id: string;
  transport: string;
  subject: string;
  participantEmail: string | null;
  status: string;
  unreadCount: number;
  lastMessageAt: Date;
  candidateId: string | null;
  candidateFirstName: string | null;
  candidateLastName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  applicationId: string | null;
  jobId: string | null;
  jobTitle: string | null;
  applicationStageName: string | null;
  hasInboundReply: boolean | null;
  needsReply: boolean | null;
  preview: string | null;
};

/** Compact thread summary. Sender-controlled text lives under `untrusted_text`. */
export function formatThread(row: ThreadRow, origin: string) {
  // A thread may keep a historical application link after its job is trashed;
  // the inbox hides it, so the tool does too (jobId is null in that case).
  const linkedApplication = row.candidateId && row.jobId ? row : null;
  return {
    id: row.id,
    url: threadUrl(origin, row.id),
    status: row.status,
    transport: row.transport,
    unread: row.unreadCount > 0,
    unreadCount: row.unreadCount,
    needsReply: Boolean(row.needsReply),
    hasInboundReply: Boolean(row.hasInboundReply),
    lastMessageAt: row.lastMessageAt.toISOString(),
    participantEmail: row.participantEmail,
    candidate: row.candidateId
      ? {
          id: row.candidateId,
          name: `${row.candidateFirstName ?? ""} ${row.candidateLastName ?? ""}`.trim(),
          url: candidateUrl(origin, row.candidateId),
        }
      : null,
    owner: row.ownerId ? { id: row.ownerId, name: row.ownerName } : null,
    application: linkedApplication
      ? {
          id: row.applicationId,
          jobId: row.jobId,
          jobTitle: row.jobTitle,
          stage: row.applicationStageName,
        }
      : null,
    untrusted_text: {
      subject: row.subject,
      preview: clip(row.preview, MAX_PREVIEW_CHARS).text,
    },
  };
}

export type MessageRow = {
  id: string;
  direction: "inbound" | "outbound";
  fromEmail: string;
  toEmails: unknown;
  subject: string;
  textBody: string;
  receivedAt: Date;
  readAt: Date | null;
};

export type AttachmentRow = { id: string; messageId: string; filename: string; contentType: string; size: number };

export function formatMessage(row: MessageRow, attachments: AttachmentRow[], origin: string) {
  const body = clip(row.textBody, MAX_BODY_CHARS);
  return {
    id: row.id,
    direction: row.direction,
    fromEmail: row.fromEmail,
    toEmails: Array.isArray(row.toEmails)
      ? row.toEmails.filter((item): item is string => typeof item === "string")
      : [],
    receivedAt: row.receivedAt.toISOString(),
    read: row.readAt !== null,
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      // Needs a signed-in browser session; MCP clients use messages_get_attachment.
      downloadUrl: attachmentUrl(origin, attachment.id),
    })),
    untrusted_text: { subject: row.subject, body: body.text, bodyTruncated: body.truncated },
  };
}

export function pageWindow(input: { limit?: number; offset?: number }) {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT)));
  const offset = Math.max(0, Math.floor(input.offset ?? 0));
  return { limit, offset };
}

/** `rows` was fetched with `limit + 1`; trims it and reports whether more exist. */
export function pageResult<T>(rows: T[], window: { limit: number; offset: number }) {
  const hasMore = rows.length > window.limit;
  return {
    items: rows.slice(0, window.limit),
    hasMore,
    nextOffset: hasMore ? window.offset + window.limit : null,
  };
}

type ActionFailure = { ok?: boolean; success?: boolean; error?: string; code?: string };

/**
 * Existing server actions report expected failures as `{ ok:false, error }` or
 * `{ success:false, error }` instead of throwing. Turn those into tool errors
 * with a sensible code; return successful results untouched.
 */
export function unwrapAction<T extends ActionFailure>(result: T, fallback: string): T {
  const failed = result.ok === false || result.success === false;
  if (!failed) return result;
  const message = result.error?.trim() || fallback;
  if (result.code === "delivery_unknown" || result.code === "delivery_in_progress") {
    throw new McpToolError(message, "conflict");
  }
  if (/does not belong|not a workspace member/i.test(message)) throw new McpToolError(message, "invalid_input");
  if (/not found|no longer active/i.test(message)) throw new McpToolError(message, "not_found");
  if (/not configured|enable ai/i.test(message)) throw new McpToolError(message, "unavailable");
  throw new McpToolError(message, "invalid_input");
}

const KNOWN_VARIABLES = new Set<string>(TEMPLATE_VARIABLES.map((variable) => variable.key));
const VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_.\-]+)\s*\}\}/g;

function canonicalKey(key: string) {
  return key.toLowerCase().replace(/[-.]/g, "_");
}

/** Known template variables a text references that have no value. */
export function missingTemplateVariables(text: string, values: TemplateValues): string[] {
  const missing = new Set<string>();
  for (const match of text.matchAll(VARIABLE_REGEX)) {
    const key = canonicalKey(match[1]);
    if (KNOWN_VARIABLES.has(key) && !values[key as keyof TemplateValues]) missing.add(key);
  }
  return [...missing];
}

/**
 * Fill a stored template (HTML body) into a plain-text email. Refuses to
 * render when a referenced variable has no value, so a recipient never gets a
 * blank where a name, date or link belongs.
 */
export function renderTemplate(
  template: { subject: string; body: string },
  values: TemplateValues,
): { subject: string; body: string } {
  const missing = [
    ...new Set([...missingTemplateVariables(template.subject, values), ...missingTemplateVariables(template.body, values)]),
  ];
  if (missing.length > 0) {
    throw new McpToolError(
      `The template needs values for: ${missing.join(", ")}. Pass them in "variables" or choose another template.`,
      "invalid_input",
    );
  }
  return {
    subject: interpolateTemplate(template.subject, values),
    body: templateHtmlToPlainText(interpolateTemplate(template.body, values)),
  };
}

/** Variables the bulk sender fills per recipient (see sendBulkCandidateEmail). */
export const BULK_FILLED_VARIABLES = new Set([
  "candidate_first_name",
  "candidate_last_name",
  "candidate_full_name",
  "job_title",
  "company_name",
  "sender_name",
]);

/** Variables in `text` that bulk email cannot fill per recipient. */
export function unsupportedBulkVariables(text: string): string[] {
  const unsupported = new Set<string>();
  for (const match of text.matchAll(VARIABLE_REGEX)) {
    const key = canonicalKey(match[1]);
    if (!BULK_FILLED_VARIABLES.has(key)) unsupported.add(match[1]);
  }
  return [...unsupported];
}
