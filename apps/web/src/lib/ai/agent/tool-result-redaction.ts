import "server-only";

import { createHash } from "node:crypto";

import type { ToolSet } from "ai";
import { and, eq, inArray } from "drizzle-orm";

import { candidates, db } from "@harly/db";

import {
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
 * - Every string in the result is scrubbed of the known identities (names and
 *   emails collected from the result, plus the stored names and emails of any
 *   candidate id the result carries), and of generic emails, links, phones and
 *   street addresses.
 * - Ids are kept, so follow-up tool calls still resolve.
 *
 * Failure is closed: when redaction cannot complete, the model receives a fixed
 * withheld notice, never the raw result.
 */

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
   * Loads the stored identity of candidate ids found in a result. Required when
   * `anonymize` is on, so names that appear only in free text are still known.
   */
  resolveCandidateIdentities?: (
    candidateIds: readonly string[],
  ) => Promise<CandidateIdentityRecord[]>;
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
};

/** Shown to the model in place of a result that could not be redacted. */
export const WITHHELD_TOOL_RESULT_TEXT =
  "Tool result withheld: candidate anonymization is on and this result could not be redacted safely. Tell the user the result is unavailable and do not guess its contents.";

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
  "from",
  "to",
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

/** Mail-header keys whose `Name <address>` values are parsed for identities. */
const MAIL_ADDRESS_KEYS = new Set(["from", "to", "cc", "bcc", "sender", "recipient", "recipients", "replyTo"]);

const EMAIL_VALUE_KEYS = new Set(["email", "emails", "candidateEmail"]);

const CANDIDATE_CONTAINER_KEYS = new Set(["candidate", "candidates"]);


const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;
const NAMED_ADDRESS_RE = /"?([^"<>,;@]*?)"?\s*<([^<>\s]+@[^<>\s]+)>/gu;
/** Record ids are kept verbatim; the phone pattern would otherwise match their digits. */
const UUID_SPAN_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/giu;

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

/**
 * Stable identity key for a record: its candidate id when it has one, otherwise
 * a key from its own name. Undefined when the record names no one.
 */
function identityKey(obj: Record<string, unknown>, inCandidate: boolean): string | undefined {
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
  const names = ownNames(obj, inCandidate);
  if (names.length > 0) {
    const email = typeof obj.email === "string" ? foldText(obj.email) : "";
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

// ── Pass 1: collect identities from the result ─────────────────────────────

type IdentityPool = {
  /** Names grouped by identity key (candidate id or person key). */
  keyed: Map<string, Set<string>>;
  /** Names parsed from mail headers, not tied to a candidate record. */
  looseNames: Set<string>;
  emails: Set<string>;
  /** Candidate ids whose stored identity must be loaded. */
  lookupIds: Set<string>;
};

function addKeyed(pool: IdentityPool, key: string, names: readonly string[]): void {
  const set = pool.keyed.get(key) ?? new Set<string>();
  for (const name of names) set.add(name);
  pool.keyed.set(key, set);
}

function collectMailAddresses(value: unknown, pool: IdentityPool): void {
  if (Array.isArray(value)) {
    for (const item of value) collectMailAddresses(item, pool);
    return;
  }
  if (typeof value !== "string") return;
  for (const match of value.matchAll(NAMED_ADDRESS_RE)) {
    const name = nonEmptyString(match[1]);
    if (name) pool.looseNames.add(name);
    pool.emails.add(match[2]);
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

function collect(value: unknown, parentKey: string | undefined, pool: IdentityPool): void {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, parentKey, pool);
    return;
  }
  if (!isPlainRecord(value)) return;

  const inCandidate = isCandidateRecord(value, parentKey);
  const key = identityKey(value, inCandidate);
  const names = ownNames(value, inCandidate);
  if (key && names.length > 0) addKeyed(pool, key, names);

  if (typeof value.candidateId === "string" && value.candidateId.length > 0) {
    pool.lookupIds.add(value.candidateId);
  } else if (
    inCandidate &&
    typeof value.id === "string" &&
    (value.group === "candidates" || typeof value.email === "string")
  ) {
    pool.lookupIds.add(value.id);
  }

  for (const [childKey, child] of Object.entries(value)) {
    if (EMAIL_VALUE_KEYS.has(childKey)) collectEmails(child, pool);
    if (MAIL_ADDRESS_KEYS.has(childKey)) collectMailAddresses(child, pool);
    collect(child, childKey, pool);
  }
}

function addLoadedRecords(pool: IdentityPool, records: readonly CandidateIdentityRecord[]): void {
  for (const record of records) {
    const names = [
      nonEmptyString(record.firstName),
      nonEmptyString(record.lastName),
      nonEmptyString([record.firstName, record.lastName].filter(Boolean).join(" ")),
    ].filter((name): name is string => name !== null);
    addKeyed(pool, `id:${record.id}`, names);
    const email = nonEmptyString(record.email);
    if (email) pool.emails.add(email);
  }
}

// ── Pass 2: rewrite the result ─────────────────────────────────────────────

type Redactor = {
  conversationKey: string;
  names: readonly string[];
  emails: readonly string[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove identities from free text. Generic identifiers go first, then each
 * known name whose words appear in the text (a cheap pre-check, so long lists
 * do not run the name matcher on every string).
 */
function scrubSpan(text: string, redactor: Redactor): string {
  let out = redactText(text, {}) ?? text;
  for (const email of redactor.emails) {
    out = out.replace(new RegExp(escapeRegExp(email), "giu"), REDACTED_PLACEHOLDER);
  }
  const folded = foldText(out);
  for (const name of redactor.names) {
    const words = name.split(/[\s\-._'’]+/u).map(foldText).filter((word) => word.length >= 2);
    if (!words.some((word) => folded.includes(word))) continue;
    out = redactText(out, { fullName: name }) ?? out;
  }
  return out;
}

function scrubText(text: string, redactor: Redactor): string {
  // split() with a capture group keeps the UUIDs at odd indexes, untouched.
  return text
    .split(UUID_SPAN_RE)
    .map((part, index) => (index % 2 === 1 ? part : scrubSpan(part, redactor)))
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
  const key = identityKey(value, inCandidate);
  const out: Record<string, unknown> = {};

  for (const [childKey, child] of Object.entries(value)) {
    const isNameKey =
      ALWAYS_NAME_KEYS.has(childKey) ||
      (inCandidate && CANDIDATE_NAME_KEYS.has(childKey)) ||
      (childKey === "primary" && value.group === "candidates");

    if (isNameKey && nonEmptyString(child) !== null) {
      out[childKey] = key ? pseudonymFor(redactor.conversationKey, key) : REDACTED_PLACEHOLDER;
    } else if (REDACTED_KEYS.has(childKey) || (inCandidate && CANDIDATE_REDACTED_KEYS.has(childKey))) {
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
 * anonymization is off. Throws when it cannot redact safely; callers must treat
 * a throw as "withhold", never as "send the raw result".
 */
export async function redactToolResult(
  toolName: string,
  result: unknown,
  ctx: ToolResultRedactionContext,
): Promise<unknown> {
  if (!ctx.anonymize) return result;
  if (!ctx.resolveCandidateIdentities) {
    throw new Error(`Tool result redaction for ${toolName} has no candidate identity resolver`);
  }

  const pool: IdentityPool = {
    keyed: new Map(),
    looseNames: new Set(),
    emails: new Set(),
    lookupIds: new Set(),
  };
  collect(result, undefined, pool);

  if (pool.lookupIds.size > 0) {
    const records = await ctx.resolveCandidateIdentities([...pool.lookupIds]);
    addLoadedRecords(pool, records);
  }

  const names = new Set<string>(pool.looseNames);
  for (const set of pool.keyed.values()) for (const name of set) names.add(name);

  return rewrite(result, undefined, {
    conversationKey: ctx.conversationKey,
    names: [...names],
    emails: [...pool.emails],
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
    redacted = await redactToolResult(toolName, options.output, ctx);
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
  return {
    ...tool,
    toModelOutput: (options: ModelOutputOptions) => modelOutputFor(toolName, original, options, ctx),
  };
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

/** Load the stored identity of candidates in this workspace, for redaction. */
export async function loadCandidateIdentities(
  workspaceId: string,
  candidateIds: readonly string[],
): Promise<CandidateIdentityRecord[]> {
  if (candidateIds.length === 0) return [];
  return db
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
    })
    .from(candidates)
    .where(and(eq(candidates.workspaceId, workspaceId), inArray(candidates.id, [...candidateIds])));
}
