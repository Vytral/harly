import "server-only";

import { createHash } from "node:crypto";

import Ajv, { type AnySchema, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

const MAX_SCHEMA_BYTES = 32 * 1024;
const MAX_SCHEMA_DEPTH = 24;
const MAX_SCHEMA_NODES = 2_000;
const MAX_VALIDATORS = 128;
const MAX_ISSUES = 5;

const validatorCache = new Map<string, ValidateFunction>();

type CompiledSchema =
  | { ok: true; validator: ValidateFunction }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBoundedJson(value: unknown, depth = 0, budget = { nodes: 0 }): boolean {
  budget.nodes += 1;
  if (budget.nodes > MAX_SCHEMA_NODES || depth > MAX_SCHEMA_DEPTH) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isBoundedJson(item, depth + 1, budget));
  if (!isRecord(value)) return false;

  return Object.entries(value).every(([key, item]) =>
    key.length <= 256 && isBoundedJson(item, depth + 1, budget),
  );
}

function describeAjvError(error: NonNullable<ValidateFunction["errors"]>[number]): string {
  const path = error.instancePath || "$";
  const extra = typeof error.params === "object" && error.params !== null &&
      "additionalProperty" in error.params && typeof error.params.additionalProperty === "string"
    ? ` (${error.params.additionalProperty.slice(0, 80)})`
    : "";
  return `${path} ${error.message ?? "does not match the schema"}${extra}`.slice(0, 240);
}

function compileSchema(schema: unknown): CompiledSchema {
  if (!isRecord(schema)) return { ok: false, error: "The payload schema must be a JSON object." };
  if (typeof schema.type === "string" && schema.type !== "object") {
    return { ok: false, error: "The root payload schema must accept a JSON object." };
  }
  if (Array.isArray(schema.type) && !schema.type.includes("object")) {
    return { ok: false, error: "The root payload schema must accept a JSON object." };
  }
  if (!isBoundedJson(schema)) {
    return { ok: false, error: "The payload schema is too complex. Reduce its nesting or number of rules." };
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(schema);
  } catch {
    return { ok: false, error: "The payload schema must contain valid JSON values only." };
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_SCHEMA_BYTES) {
    return { ok: false, error: `The payload schema must be ${MAX_SCHEMA_BYTES / 1024} KB or smaller.` };
  }

  const cacheKey = createHash("sha256").update(serialized).digest("hex");
  const cached = validatorCache.get(cacheKey);
  if (cached) {
    validatorCache.delete(cacheKey);
    validatorCache.set(cacheKey, cached);
    return { ok: true, validator: cached };
  }

  try {
    const compiler = new Ajv({
      allErrors: false,
      coerceTypes: false,
      ownProperties: true,
      removeAdditional: false,
      strict: true,
      useDefaults: false,
      validateFormats: true,
    });
    addFormats(compiler);
    const validator = compiler.compile(schema as AnySchema);
    validatorCache.set(cacheKey, validator);
    if (validatorCache.size > MAX_VALIDATORS) {
      const oldestKey = validatorCache.keys().next().value;
      if (oldestKey !== undefined) validatorCache.delete(oldestKey);
    }
    return { ok: true, validator };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The schema is not supported.";
    return { ok: false, error: `Invalid payload schema: ${message.slice(0, 220)}` };
  }
}

/** Validate and normalize the JSON Schema before persisting endpoint config. */
export function assertWorkflowWebhookPayloadSchema(
  schema: unknown,
): Record<string, unknown> {
  const result = compileSchema(schema);
  if (!result.ok) throw new Error(result.error);
  return schema as Record<string, unknown>;
}

export type WorkflowWebhookPayloadValidation =
  | { valid: true }
  | { valid: false; kind: "schema" | "payload"; issues: string[] };

/** Enforce an endpoint's saved JSON Schema before accepting an event receipt. */
export function validateWorkflowWebhookPayload(
  schema: unknown,
  payload: unknown,
): WorkflowWebhookPayloadValidation {
  const result = compileSchema(schema);
  if (!result.ok) {
    return { valid: false, kind: "schema", issues: [result.error] };
  }
  if (result.validator(payload)) return { valid: true };

  return {
    valid: false,
    kind: "payload",
    issues: (result.validator.errors ?? []).slice(0, MAX_ISSUES).map(describeAjvError),
  };
}
