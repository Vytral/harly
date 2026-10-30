import "server-only";

import { createHash } from "node:crypto";

import type { ToolSet } from "ai";
import { and, eq, inArray, sql } from "drizzle-orm";

import { applications, candidates, db, interviews } from "@harly/db";

import {
  createNameRedactor,
  REDACTED_PLACEHOLDER,
  redactText,
} from "@/features/candidates/anonymize";
import { ANONYMIZED_CANDIDATE_LABEL } from "@/lib/ai/candidate-context";

/**
 * Identity redaction for the Harly AI tool boundary.
 *
 * When the workspace's candidate anonymization is on, tool results must not
 * carry candidate identity to the model. Every tool result passes through
 * `redactToolResult` on its way to the model (see `withToolResultRedaction`,
 * which hooks the AI SDK `toModelOutput` seam). The UI stream and the persisted
 * conversation keep the raw result; only the model input is redacted.
 *
 * What is removed when anonymization is on:
 * - Name fields on candidate records become a stable per-conversation pseudonym
 *   ("Candidate 7KQ2MX"), so the model can still tell two candidates apart.
 * - Email, phone, links, avatar, address and mail-header addresses are replaced
 *   by the redaction placeholder. Locations are removed from candidate records.
 * - Every string in the result is scrubbed of the known identities: the names and
 *   emails found in the result, the stored identity of every candidate the result
 *   or the tool input refers to (by candidate, application or interview id, by a
 *   candidate href, or by an email), and generic emails, links, phones and street
 *   addresses.
 * - Ids are kept, so follow-up tool calls still resolve.
 * - Tool errors reach the model as a fixed notice, not the raw message. Replayed
 *   error parts from earlier turns are replaced the same way.
 *
 * Failure is closed: when redaction cannot complete, the model receives a fixed
 * withheld notice, never the raw result.
 */

/** Which stored records a result or tool input refers to, to be looked up. */
export type CandidateReferenceRequest = {
  candidateIds: readonly string[];
  applicationIds: readonly string[];
  interviewIds: readonly string[];
  emails: readonly string[];
};

export type CandidateReferenceLookup = {
  /** Stored identity of each candidate the request resolved to, workspace-scoped. */
  candidates: CandidateIdentityRecord[];
  /** Application id to its candidate id, workspace-scoped. */
  candidateIdByApplicationId: ReadonlyMap<string, string>;
  /** Interview id to its candidate id, workspace-scoped. */
  candidateIdByInterviewId: ReadonlyMap<string, string>;
  /** Lowercased email to its candidate id, workspace-scoped. */
  candidateIdByEmail: ReadonlyMap<string, string>;
};

/** Context a request's tools are redacted under. */
export type ToolResultRedactionContext = {
  /** The workspace `aiResumeAnonymization` setting. When false nothing changes. */
  anonymize: boolean;
  /**
   * Scopes the pseudonyms: the same candidate gets the same label within one
   * conversation and a different one in another conversation.
   */
  conversationKey: string;
  /**
   * Loads the stored identity behind the references a result or tool input
   * carries. Required when `anonymize` is on, so names that appear only in free
   * text are still known.
   */
  resolveCandidateReferences?: (
    request: CandidateReferenceRequest,
  ) => Promise<CandidateReferenceLookup>;
};

export type CandidateIdentityRecord = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };

/** The shape `toModelOutput` returns to the AI SDK. */
export type ModelToolOutput =
  | { type: "text"; value: string }
  | { type: "json"; value: JsonValue }
  | { type: "error-text"; value: string };

type ModelOutputOptions = {
  toolCallId: string;
  input: unknown;
  output: unknown;
};

type ToolWithModelOutput = {
  toModelOutput?: (options: ModelOutputOptions) => ModelToolOutput | PromiseLike<ModelToolOutput>;
  execute?: (input: unknown, options: unknown) => unknown;
};

/** Shown to the model in place of a result that could not be redacted. */
export const WITHHELD_TOOL_RESULT_TEXT =
  "Tool result withheld: candidate anonymization is on and this result could not be redacted safely. Tell the user the result is unavailable and do not guess its contents.";

/**
 * Shown to the model in place of a tool failure's message. Error messages often
 * name the candidate or the email involved, so anonymized conversations never see
 * them. The UI stream keeps its own generic error text.
 */
export const WITHHELD_TOOL_ERROR_TEXT =
  "Tool failed and its error is withheld because candidate anonymization is on. Tell the user the action did not complete and do not guess the cause.";

// ── Key classification ─────────────────────────────────────────────────────

/** Name-valued keys that identify a candidate wherever they appear. */
const ALWAYS_NAME_KEYS = new Set([
  "firstName",
  "lastName",
  "fullName",
  "candidateName",
  "first",
  "last",
]);

/** Name-valued keys that identify the candidate only on a candidate record. */
const CANDIDATE_NAME_KEYS = new Set(["name"]);

/**
 * Keys whose string value is a candidate's name (for example a task's or an
 * interview's candidate). The value is replaced whole, because the name is known
 * to be a name whatever its text.
 */
const CANDIDATE_STRING_NAME_KEYS = new Set(["candidate"]);

/** Values removed wherever they appear. */
const REDACTED_KEYS = new Set([
  "email",
  "emails",
  "candidateEmail",
  "phone",
  "phoneNumber",
  "mobile",
  "address",
  "streetAddress",
  "linkedinUrl",
  "linkedin",
  "githubUrl",
  "websiteUrl",
  "portfolioUrl",
  "avatarUrl",
  "photoUrl",
  "referrer",
  "referrerName",
  "referredBy",
  "cc",
  "bcc",
  "sender",
  "recipient",
  "recipients",
  "replyTo",
]);

/** Keys removed only from candidate records. Location is not needed to judge fit. */
const CANDIDATE_REDACTED_KEYS = new Set([
  "location",
  "city",
  "region",
  "country",
  "postalCode",
  "zip",
  "zipCode",
]);

/**
 * Mail-header keys. `from` and `to` are also used for date ranges, so they are
 * redacted only when the value holds an address or the object is a mail message.
 */
const MAIL_ADDRESS_KEYS = new Set(["from", "to", "cc", "bcc", "sender", "recipient", "recipients", "replyTo"]);

/** Keys that mark an object as a mail message. */
const MAIL_MESSAGE_KEYS = new Set(["subject", "snippet", "body", "messageId", "threadId", "headers"]);

const EMAIL_VALUE_KEYS = new Set(["email", "emails", "candidateEmail"]);

const CANDIDATE_CONTAINER_KEYS = new Set(["candidate", "candidates"]);

/** Keys whose value is a candidate, application or interview id. */
const CANDIDATE_ID_KEYS = new Set(["candidateId", "candidateIds", "mentionedCandidateIds"]);
const APPLICATION_ID_KEYS = new Set(["applicationId", "applicationIds"]);
const INTERVIEW_ID_KEYS = new Set(["interviewId", "interviewIds"]);
/** Parents whose `id` children are interviews (for example `interviews[].id`). */
const INTERVIEW_CONTAINER_KEYS = new Set(["interviews", "interview"]);

const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;
const NAMED_ADDRESS_RE = /"?([^"<>,;@]*?)"?\s*<([^<>\s]+@[^<>\s]+)>/gu;
/** Record ids are kept verbatim; the phone pattern would otherwise match their digits. */
const UUID_SPAN_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/giu;
/** A candidate profile link such as `/dashboard/candidates/<uuid>`. */
const CANDIDATE_HREF_RE = /\/candidates\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/giu;

const PSEUDONYM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PSEUDONYM_LENGTH = 6;

// ── Helpers ────────────────────────────────────────────────────────────────

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Lowercase, accent-free and whitespace-normalized, for matching and keys. */
function foldText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function ownNames(obj: Record<string, unknown>, inCandidate: boolean): string[] {
  const names: string[] = [];
  for (const key of ALWAYS_NAME_KEYS) {
    const value = nonEmptyString(obj[key]);
    if (value) names.push(value);
  }
  if (inCandidate) {
    const value = nonEmptyString(obj.name);
    if (value) names.push(value);
  }
  if (obj.group === "candidates") {
    const value = nonEmptyString(obj.primary);
    if (value) names.push(value);
  }
  return names;
}

function isCandidateRecord(obj: Record<string, unknown>, parentKey: string | undefined): boolean {
  if (parentKey !== undefined && CANDIDATE_CONTAINER_KEYS.has(parentKey)) return true;
  return (
    obj.group === "candidates" ||
    typeof obj.candidateId === "string" ||
    typeof obj.email === "string" ||
    nonEmptyString(obj.firstName) !== null ||
    nonEmptyString(obj.lastName) !== null ||
    nonEmptyString(obj.fullName) !== null
  );
}

/** Mail-shaped when it carries a message field, or any address-bearing value. */
function isMailHeader(record: Record<string, unknown>, value: unknown): boolean {
  if (Object.keys(record).some((key) => MAIL_MESSAGE_KEYS.has(key))) return true;
  return containsAddress(value);
}

function containsAddress(value: unknown): boolean {
  if (typeof value === "string") return value.includes("@");
  if (Array.isArray(value)) return value.some(containsAddress);
  return false;
}

/**
 * Stable identity key for a record: its candidate id when it has one, otherwise
 * a key from its own name. Undefined when the record names no one.
 */
function identityKey(
  obj: Record<string, unknown>,
  inCandidate: boolean,
  aliases: ReadonlyMap<string, string>,
): string | undefined {
  if (typeof obj.candidateId === "string" && obj.candidateId.length > 0) {
    return `id:${obj.candidateId}`;
  }
  if (
    inCandidate &&
    typeof obj.id === "string" &&
    obj.id.length > 0 &&
    (obj.group === "candidates" ||
      typeof obj.email === "string" ||
      ownNames(obj, true).length > 0)
  ) {
    return `id:${obj.id}`;
  }
  // The same person under a different shape: an email resolves to its candidate id.
  const email = typeof obj.email === "string" ? foldText(obj.email) : "";
  const aliased = email ? aliases.get(email) : undefined;
  if (aliased) return `id:${aliased}`;
  const names = ownNames(obj, inCandidate);
  if (names.length > 0) {
    return `person:${foldText(names.join(" "))}|${email}`;
  }
  return undefined;
}

function pseudonymFor(conversationKey: string, key: string): string {
  const digest = createHash("sha256").update(conversationKey).update("\0").update(key).digest();
  let code = "";
  for (let index = 0; index < PSEUDONYM_LENGTH; index++) {
    code += PSEUDONYM_ALPHABET[digest[index] % PSEUDONYM_ALPHABET.length];
  }
  return `${ANONYMIZED_CANDIDATE_LABEL} ${code}`;
}

// ── Pass 1: collect identities and references from the result ─────────────

type IdentityPool = {
  /** Every name that must not reach the model, from the result and the lookups. */
  names: Set<string>;
  emails: Set<string>;
  /** Email (lowercased) to candidate id, filled from the lookup. */
  aliases: Map<string, string>;
  candidateIds: Set<string>;
  applicationIds: Set<string>;
  interviewIds: Set<string>;
};

function emptyPool(): IdentityPool {
  return {
    names: new Set(),
    emails: new Set(),
    aliases: new Map(),
    candidateIds: new Set(),
    applicationIds: new Set(),
    interviewIds: new Set(),
  };
}

function collectMailAddresses(value: unknown, pool: IdentityPool): void {
  if (Array.isArray(value)) {
    for (const item of value) collectMailAddresses(item, pool);
    return;
  }
  if (typeof value !== "string") return;
  for (const match of value.matchAll(NAMED_ADDRESS_RE)) {
    const name = nonEmptyString(match[1]);
    if (name) pool.names.add(name);
    pool.emails.add(match[2]!);
  }
  for (const match of value.matchAll(EMAIL_RE)) pool.emails.add(match[0]);
}

function collectEmails(value: unknown, pool: IdentityPool): void {
  if (Array.isArray(value)) {
    for (const item of value) collectEmails(item, pool);
    return;
  }
  const email = nonEmptyString(value);
  if (email) pool.emails.add(email);
}

function addIds(target: Set<string>, value: unknown): void {
  if (typeof value === "string" && value.length > 0) target.add(value);
  if (Array.isArray(value)) {
    for (const item of value) if (typeof item === "string" && item.length > 0) target.add(item);
  }
}

/** References named in a tool input: the model's ids, resolved through the lookup. */
function collectInputReferences(value: unknown, pool: IdentityPool, parentKey?: string): void {
  if (Array.isArray(value)) {
    for (const item of value) collectInputReferences(item, pool, parentKey);
    return;
  }
  if (!isPlainRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (CANDIDATE_ID_KEYS.has(key)) addIds(pool.candidateIds, child);
    else if (APPLICATION_ID_KEYS.has(key)) addIds(pool.applicationIds, child);
    else if (INTERVIEW_ID_KEYS.has(key)) addIds(pool.interviewIds, child);
    else if (key === "id" && parentKey !== undefined && INTERVIEW_CONTAINER_KEYS.has(parentKey)) {
      addIds(pool.interviewIds, child);
    }
    collectInputReferences(child, pool, key);
  }
}

function collect(value: unknown, parentKey: string | undefined, pool: IdentityPool): void {
  if (typeof value === "string") {
    for (const match of value.matchAll(CANDIDATE_HREF_RE)) pool.candidateIds.add(match[1]!);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, parentKey, pool);
    return;
  }
  if (!isPlainRecord(value)) return;

  const inCandidate = isCandidateRecord(value, parentKey);
  for (const name of ownNames(value, inCandidate)) pool.names.add(name);

  // A candidate's own id, or any id on a record that names or contacts a candidate.
  addIds(pool.candidateIds, value.candidateId);
  if (inCandidate) addIds(pool.candidateIds, value.id);
  if (parentKey !== undefined && INTERVIEW_CONTAINER_KEYS.has(parentKey)) addIds(pool.interviewIds, value.id);

  for (const [childKey, child] of Object.entries(value)) {
    if (EMAIL_VALUE_KEYS.has(childKey)) collectEmails(child, pool);
    if (MAIL_ADDRESS_KEYS.has(childKey)) collectMailAddresses(child, pool);
    if (APPLICATION_ID_KEYS.has(childKey)) addIds(pool.applicationIds, child);
    if (INTERVIEW_ID_KEYS.has(childKey)) addIds(pool.interviewIds, child);
    collect(child, childKey, pool);
  }
}

function addLoadedRecords(pool: IdentityPool, lookup: CandidateReferenceLookup): void {
  for (const record of lookup.candidates) {
    const first = nonEmptyString(record.firstName);
    const last = nonEmptyString(record.lastName);
    if (first) pool.names.add(first);
    if (last) pool.names.add(last);
    const full = [first, last].filter((part): part is string => part !== null).join(" ");
    if (full) pool.names.add(full);
    const email = nonEmptyString(record.email);
    if (email) pool.emails.add(email);
  }
  for (const [email, candidateId] of lookup.candidateIdByEmail) {
    pool.aliases.set(foldText(email), candidateId);
  }
}

// ── Pass 2: rewrite the result ─────────────────────────────────────────────

type Redactor = {
  conversationKey: string;
  aliases: ReadonlyMap<string, string>;
  /** Scrubs free text of every known name and email. */
  scrub: (text: string) => string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** An address the generic email pattern already removes wherever it appears. */
const EMAIL_SHAPE_RE = /^[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}$/u;

function buildScrubber(names: readonly string[], emails: readonly string[]): (text: string) => string {
  // Addresses in the usual shape are removed by the generic pass; only the rest need a search.
  const emailPatterns = emails
    .filter((email) => email.length > 0 && !EMAIL_SHAPE_RE.test(email))
    .map((email) => ({ lower: email.toLowerCase(), pattern: new RegExp(escapeRegExp(email), "giu") }));
  const nameRedactor = createNameRedactor(names.map((name) => ({ fullName: name })));
  return (text) => {
    let out = redactText(text, {}) ?? text;
    if (emailPatterns.length > 0) {
      const lower = out.toLowerCase();
      for (const { lower: emailLower, pattern } of emailPatterns) {
        // Most strings hold no known email, so the cheap substring check comes first.
        if (lower.includes(emailLower)) out = out.replace(pattern, REDACTED_PLACEHOLDER);
      }
    }
    return nameRedactor(out);
  };
}

function scrubText(text: string, redactor: Redactor): string {
  // split() with a capture group keeps the UUIDs at odd indexes, untouched.
  return text
    .split(UUID_SPAN_RE)
    .map((part, index) => (index % 2 === 1 ? part : redactor.scrub(part)))
    .join("");
}

function redactEverything(value: unknown): unknown {
  if (typeof value === "string") return value.length > 0 ? REDACTED_PLACEHOLDER : value;
  if (Array.isArray(value)) return value.map(redactEverything);
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, redactEverything(child)]),
    );
  }
  return value;
}

function rewrite(value: unknown, parentKey: string | undefined, redactor: Redactor): unknown {
  if (typeof value === "string") return scrubText(value, redactor);
  if (Array.isArray(value)) return value.map((item) => rewrite(item, parentKey, redactor));
  if (!isPlainRecord(value)) return value;

  const inCandidate = isCandidateRecord(value, parentKey);
  const key = identityKey(value, inCandidate, redactor.aliases);
  const out: Record<string, unknown> = {};

  for (const [childKey, child] of Object.entries(value)) {
    const isNameKey =
      ALWAYS_NAME_KEYS.has(childKey) ||
      (inCandidate && CANDIDATE_NAME_KEYS.has(childKey)) ||
      (childKey === "primary" && value.group === "candidates") ||
      (CANDIDATE_STRING_NAME_KEYS.has(childKey) && typeof child === "string");

    if (isNameKey && nonEmptyString(child) !== null) {
      out[childKey] = key ? pseudonymFor(redactor.conversationKey, key) : REDACTED_PLACEHOLDER;
    } else if (REDACTED_KEYS.has(childKey) || (inCandidate && CANDIDATE_REDACTED_KEYS.has(childKey))) {
      out[childKey] = redactEverything(child);
    } else if (MAIL_ADDRESS_KEYS.has(childKey) && isMailHeader(value, child)) {
      out[childKey] = redactEverything(child);
    } else {
      out[childKey] = rewrite(child, childKey, redactor);
    }
  }
  return out;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Redact one tool result for the model. Returns the result unchanged when
 * anonymization is off. `input` is the tool call's arguments: the candidate,
 * application and interview ids in it resolve names that the result may only
 * mention in prose. Throws when it cannot redact safely; callers must treat a
 * throw as "withhold", never as "send the raw result".
 */
export async function redactToolResult(
  toolName: string,
  result: unknown,
  ctx: ToolResultRedactionContext,
  input?: unknown,
): Promise<unknown> {
  if (!ctx.anonymize) return result;
  if (!ctx.resolveCandidateReferences) {
    throw new Error(`Tool result redaction for ${toolName} has no candidate identity resolver`);
  }

  const pool = emptyPool();
  collect(result, undefined, pool);
  collectInputReferences(input, pool);

  const request: CandidateReferenceRequest = {
    candidateIds: [...pool.candidateIds],
    applicationIds: [...pool.applicationIds],
    interviewIds: [...pool.interviewIds],
    emails: [...pool.emails],
  };
  if (
    request.candidateIds.length > 0 ||
    request.applicationIds.length > 0 ||
    request.interviewIds.length > 0 ||
    request.emails.length > 0
  ) {
    addLoadedRecords(pool, await ctx.resolveCandidateReferences(request));
  }

  return rewrite(result, undefined, {
    conversationKey: ctx.conversationKey,
    aliases: pool.aliases,
    scrub: buildScrubber([...pool.names], [...pool.emails]),
  });
}

function withheld(): ModelToolOutput {
  return { type: "error-text", value: WITHHELD_TOOL_RESULT_TEXT };
}

async function modelOutputFor(
  toolName: string,
  original: ToolWithModelOutput | undefined,
  options: ModelOutputOptions,
  ctx: ToolResultRedactionContext,
): Promise<ModelToolOutput> {
  let redacted: unknown;
  try {
    redacted = await redactToolResult(toolName, options.output, ctx, options.input);
  } catch {
    return withheld();
  }
  if (original?.toModelOutput) {
    return original.toModelOutput({ ...options, output: redacted });
  }
  if (typeof redacted === "string") return { type: "text", value: redacted };
  return { type: "json", value: (redacted === undefined ? null : redacted) as JsonValue };
}

function guardTool<T>(toolName: string, tool: T, ctx: ToolResultRedactionContext): T {
  const original = tool as ToolWithModelOutput;
  const guarded: ToolWithModelOutput = {
    ...(tool as object),
    toModelOutput: (options: ModelOutputOptions) => modelOutputFor(toolName, original, options, ctx),
  };
  if (typeof original.execute === "function") {
    // Tool errors skip toModelOutput in the AI SDK and reach the model as raw text,
    // so the failure itself is replaced here. The UI stream never shows this text.
    guarded.execute = async (input: unknown, options: unknown) => {
      try {
        return await original.execute!(input, options);
      } catch {
        throw new Error(WITHHELD_TOOL_ERROR_TEXT);
      }
    };
  }
  return guarded as T;
}

/**
 * Hook every tool's model output through `redactToolResult`. Returns the tool
 * set itself when anonymization is off, so the output is byte-for-byte unchanged.
 */
export function withToolResultRedaction<T extends ToolSet>(
  tools: T,
  ctx: ToolResultRedactionContext,
): T {
  if (!ctx.anonymize) return tools;
  const guarded = {} as Record<string, unknown>;
  for (const [name, tool] of Object.entries(tools)) {
    guarded[name] = guardTool(name, tool, ctx);
  }
  return guarded as T;
}

/**
 * Replace the error text of tool calls from earlier turns before they are
 * converted for the model. The AI SDK sends an `output-error` part's raw text to
 * the model without calling the tool's own hook.
 */
export function withRedactedToolErrors<M>(messages: M[], ctx: ToolResultRedactionContext): M[] {
  if (!ctx.anonymize) return messages;
  return messages.map((message) => {
    if (!isPlainRecord(message) || !Array.isArray(message.parts)) return message;
    const parts = message.parts.map((part: unknown) => {
      if (!isPlainRecord(part)) return part;
      const isToolPart = typeof part.type === "string" && part.type.startsWith("tool-");
      if (!isToolPart || part.state !== "output-error") return part;
      return { ...part, errorText: WITHHELD_TOOL_ERROR_TEXT };
    });
    return { ...message, parts } as M;
  });
}

/**
 * Lookup for `convertToModelMessages`, so earlier turns' tool results are
 * redacted too. Tools no longer in the set (for example after a permission
 * change) still get the redaction, instead of falling back to the raw output.
 */
export function toolsForModelHistory<T extends ToolSet>(tools: T, ctx: ToolResultRedactionContext): ToolSet {
  if (!ctx.anonymize) return tools;
  return new Proxy(tools, {
    get(target, property, receiver) {
      if (typeof property === "string" && !Object.prototype.hasOwnProperty.call(target, property)) {
        return guardTool(property, {}, ctx);
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

/**
 * Load the stored identity behind the references in this workspace: candidate
 * ids, the candidates of application and interview ids, and candidates matched
 * by email. Everything is scoped to `workspaceId`.
 */
export async function loadCandidateReferences(
  workspaceId: string,
  request: CandidateReferenceRequest,
): Promise<CandidateReferenceLookup> {
  const applicationIds = [...new Set(request.applicationIds)];
  const interviewIds = [...new Set(request.interviewIds)];
  const emails = [...new Set(request.emails.map((email) => email.toLowerCase()))];

  const [applicationRows, interviewRows, emailRows] = await Promise.all([
    applicationIds.length === 0
      ? []
      : db
          .select({ id: applications.id, candidateId: applications.candidateId })
          .from(applications)
          .where(
            and(eq(applications.workspaceId, workspaceId), inArray(applications.id, applicationIds)),
          ),
    interviewIds.length === 0
      ? []
      : db
          .select({ id: interviews.id, candidateId: interviews.candidateId })
          .from(interviews)
          .where(and(eq(interviews.workspaceId, workspaceId), inArray(interviews.id, interviewIds))),
    emails.length === 0
      ? []
      : db
          .select({
            id: candidates.id,
            firstName: candidates.firstName,
            lastName: candidates.lastName,
            email: candidates.email,
          })
          .from(candidates)
          .where(
            and(
              eq(candidates.workspaceId, workspaceId),
              inArray(sql`lower(${candidates.email})`, emails),
            ),
          ),
  ]);

  const candidateIdByApplicationId = new Map(applicationRows.map((row) => [row.id, row.candidateId]));
  const candidateIdByInterviewId = new Map(interviewRows.map((row) => [row.id, row.candidateId]));
  const candidateIdByEmail = new Map<string, string>();
  for (const row of emailRows) {
    if (row.email) candidateIdByEmail.set(row.email.toLowerCase(), row.id);
  }

  const ids = new Set<string>([
    ...request.candidateIds,
    ...candidateIdByApplicationId.values(),
    ...candidateIdByInterviewId.values(),
  ]);
  const loadedIds = new Set(emailRows.map((row) => row.id));
  const missing = [...ids].filter((id) => !loadedIds.has(id));
  const idRows =
    missing.length === 0
      ? []
      : await db
          .select({
            id: candidates.id,
            firstName: candidates.firstName,
            lastName: candidates.lastName,
            email: candidates.email,
          })
          .from(candidates)
          .where(and(eq(candidates.workspaceId, workspaceId), inArray(candidates.id, missing)));

  return {
    candidates: [...emailRows, ...idRows],
    candidateIdByApplicationId,
    candidateIdByInterviewId,
    candidateIdByEmail,
  };
}
