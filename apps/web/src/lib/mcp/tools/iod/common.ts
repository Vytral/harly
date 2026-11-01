import { McpToolError } from "../../types";

type McpErrorCode = ConstructorParameters<typeof McpToolError>[1];

/** Map a user-facing action error string to the closest MCP error code. */
export function errorCodeFor(message: string): McpErrorCode {
  const text = message.toLowerCase();
  if (text.includes("permission") || text.includes("not allowed") || text.includes("cannot ") || text.includes("only workspace owners")) {
    return text.includes("not found") ? "not_found" : "forbidden";
  }
  if (text.includes("not found") || text.includes("does not exist")) return "not_found";
  if (
    text.includes("no longer") ||
    text.includes("already") ||
    text.includes("changed") ||
    text.includes("overlapping") ||
    text.includes("only draft") ||
    text.includes("only sent") ||
    text.includes("can't be changed")
  ) {
    return "conflict";
  }
  if (text.includes("not connected") || text.includes("not enabled") || text.includes("could not") || text.includes("unable")) {
    return "unavailable";
  }
  return "invalid_input";
}

/** Throw an McpToolError for a failed `{ success:false, error }` / `{ ok:false, error }` action result. */
export function failWith(message: string | undefined, fallback: string): never {
  const text = message?.trim() || fallback;
  throw new McpToolError(text, errorCodeFor(text));
}

/** Unwrap `{ success }` style results (interviews, offers, scorecards). */
export function assertSuccess<T extends { success: boolean; error?: string }>(result: T, fallback: string): T {
  if (!result.success) failWith(result.error, fallback);
  return result;
}

/** Unwrap `{ ok }` style results (documents, requests). */
export function assertOk<T extends { ok: boolean; error?: string }>(result: T, fallback: string): T {
  if (!result.ok) failWith(result.error, fallback);
  return result;
}
