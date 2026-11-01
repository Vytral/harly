import { z } from "zod";

import { McpToolError } from "../../types";

/**
 * Small, dependency-free helpers shared by the tasks / reports / automations /
 * settings tools. Nothing here touches the database or a server action, so the
 * mapping logic can be unit-tested without mocking the app.
 */

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** `limit` + `offset` fields reused by every list tool. */
export const pageFields = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .describe("Maximum rows to return (1-100, default 25)."),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Rows to skip, for paging. Use nextOffset from the previous response."),
};

export type Page<T> = {
  items: T[];
  total: number;
  /** Pass as `offset` to get the next page, or null on the last page. */
  nextOffset: number | null;
};

export function paginateArray<T>(items: readonly T[], limit: number, offset: number): Page<T> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const safeOffset = Math.max(Math.trunc(offset) || 0, 0);
  const slice = items.slice(safeOffset, safeOffset + safeLimit);
  const next = safeOffset + slice.length;
  return {
    items: slice,
    total: items.length,
    nextOffset: next < items.length ? next : null,
  };
}

/** Absolute deep link into the web app. */
export function appLink(origin: string, path: string): string {
  return `${origin.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Date | string | null -> ISO string | null. */
export function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type McpErrorCode = ConstructorParameters<typeof McpToolError>[1];

/** Map a human error string from a server action to an MCP error code. */
export function classifyActionError(message: string): McpErrorCode {
  const text = message.toLowerCase();
  if (text.includes("not found") || text.includes("unknown ") || text.includes("no longer available")) {
    return "not_found";
  }
  if (
    text.includes("not available to you") ||
    text.includes("permission") ||
    text.includes("not allowed") ||
    text.includes("only workspace owners") ||
    text.includes("disabled in the demo") ||
    text.includes("not authenticated") ||
    text.includes("not authorized")
  ) {
    return "forbidden";
  }
  if (
    text.includes("changed") ||
    text.includes("conflict") ||
    text.includes("already") ||
    text.includes("stale") ||
    text.includes("another confirmation")
  ) {
    return "conflict";
  }
  if (text.includes("temporarily disabled") || text.includes("unavailable") || text.includes("migration")) {
    return "unavailable";
  }
  return "invalid_input";
}

type ActionResultLike = {
  success?: boolean;
  ok?: boolean;
  error?: string;
  issues?: Array<{ message?: string; nodeId?: string; fieldPath?: string }>;
};

/**
 * Server actions in Harly return `{ success | ok, error? }` instead of
 * throwing. Turn a failed result into a McpToolError carrying the same
 * message the web UI would show (plus the first validation issues, if any).
 */
export function assertActionOk<T extends ActionResultLike>(result: T, fallback: string): T {
  const ok = result.success ?? result.ok;
  if (ok === false || (ok === undefined && result.error)) {
    const base = result.error?.trim() || fallback;
    const issues = (result.issues ?? [])
      .slice(0, 5)
      .map((issue) => [issue.nodeId, issue.fieldPath, issue.message].filter(Boolean).join(": "))
      .filter(Boolean);
    const message = issues.length > 0 ? `${base} Issues: ${issues.join(" | ")}` : base;
    throw new McpToolError(message, classifyActionError(message));
  }
  return result;
}

/** Translate an unknown thrown value from an underlying API into a tool error when expected. */
export function toToolError(error: unknown, fallback: string): never {
  if (error instanceof McpToolError) throw error;
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status)
      : null;
  const message = error instanceof Error && error.message ? error.message : fallback;
  if (status === 404) throw new McpToolError(message, "not_found");
  if (status === 403 || status === 401) throw new McpToolError(message, "forbidden");
  if (status === 409) throw new McpToolError(message, "conflict");
  if (status === 400 || status === 422) throw new McpToolError(message, "invalid_input");
  if (error instanceof Error && error.name === "ZodError") throw new McpToolError(message, "invalid_input");
  throw error;
}

/** Run fn, mapping ApiError-style failures to McpToolError. */
export async function guarded<T>(fn: () => Promise<T>, fallback: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    return toToolError(error, fallback);
  }
}

/**
 * Bound the size of an arbitrary JSON value returned to the model. Strings are
 * clipped, long arrays are cut, and depth is limited; a `_truncated` marker is
 * added where anything was dropped.
 */
export function boundJson(value: unknown, options: { maxString?: number; maxArray?: number; maxDepth?: number } = {}): unknown {
  const maxString = options.maxString ?? 600;
  const maxArray = options.maxArray ?? 50;
  const maxDepth = options.maxDepth ?? 6;
  const walk = (input: unknown, depth: number): unknown => {
    if (input === null || typeof input === "number" || typeof input === "boolean") return input;
    if (typeof input === "string") {
      return input.length > maxString ? `${input.slice(0, maxString)}… [truncated ${input.length - maxString} chars]` : input;
    }
    if (depth >= maxDepth) return "[nested value omitted]";
    if (Array.isArray(input)) {
      const kept = input.slice(0, maxArray).map((item) => walk(item, depth + 1));
      return input.length > maxArray ? [...kept, `[+${input.length - maxArray} more items omitted]`] : kept;
    }
    if (typeof input === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(input as Record<string, unknown>)) {
        if (item === undefined) continue;
        out[key] = walk(item, depth + 1);
      }
      return out;
    }
    return undefined;
  };
  return walk(value, 0);
}

const SECRET_KEY = /(secret|token|password|api[-_]?key|authorization|signature|ciphertext|credential)/i;

/** Remove secret-looking keys from a JSON tree before it reaches the model. */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) && typeof item === "string" ? "[redacted]" : redactSecrets(item);
    }
    return out;
  }
  return value;
}

/** Case-insensitive substring match across several optional fields. */
export function matchesQuery(query: string | undefined, ...fields: Array<string | null | undefined>): boolean {
  const needle = query?.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => field?.toLowerCase().includes(needle));
}

/** Validate model-supplied JSON with a (possibly complex) zod schema and report the first problems readably. */
export function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown, label: string): z.output<S> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues
    .slice(0, 6)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join(" | ");
  throw new McpToolError(`${label} is invalid. ${problems}`, "invalid_input");
}
