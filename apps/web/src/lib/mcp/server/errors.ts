import { ApiError } from "@harly/api";

import { sanitizeErrorMessage } from "@/lib/sanitize-error";

import { McpToolError } from "../types";
import { formatToolError, type FormattedToolResult } from "./results";

/**
 * Error mapping for tool calls. Expected failures (McpToolError, ApiError,
 * "Job not found."-style messages from existing server actions) reach the model
 * as an error result it can act on. Anything that looks like an internal fault
 * (SQL, stack, driver text) becomes a generic message; the details go to the
 * server log with the request id only.
 */

const INTERNAL_MARKERS =
  /failed query|\bselect\b.+\bfrom\b|\binsert into\b|\bupdate\b.+\bset\b|\bdelete from\b|relation ".*"|column ".*"|violates|ECONN|ETIMEDOUT|ENOTFOUND|socket|\n\s+at |node_modules|\.tsx?:\d+|TypeError|ReferenceError|RangeError|is not a function|undefined is not|Cannot read/i;

export const GENERIC_ERROR_MESSAGE =
  "Something went wrong on the Harly server. Nothing was changed unless a previous message said so. Try again, and if it keeps failing give the request id to an administrator.";

export type MappedError = {
  result: FormattedToolResult;
  /** True when the failure is a bug or outage worth logging at error level. */
  unexpected: boolean;
  code: string;
};

function isNextControlFlow(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test((error as { digest: string }).digest)
  );
}

export function mapToolError(error: unknown, requestId: string): MappedError {
  if (error instanceof McpToolError) {
    return { result: formatToolError(error.message, error.code), unexpected: false, code: error.code };
  }
  if (error instanceof ApiError) {
    const code = error.code === "rate_limited" ? "rate_limited" : error.code === "not_found" ? "not_found" : error.code === "forbidden" || error.code === "unauthorized" ? "forbidden" : error.code === "conflict" ? "conflict" : "invalid_input";
    return {
      result: formatToolError(sanitizeErrorMessage(error.message, 300) || "The request was refused.", code),
      unexpected: error.code === "internal",
      code,
    };
  }
  if (isNextControlFlow(error)) {
    // redirect()/notFound() from a page-oriented helper: the user can't do this here.
    return {
      result: formatToolError("That resource is not available to you or does not exist.", "not_found"),
      unexpected: false,
      code: "not_found",
    };
  }
  if (error instanceof Error) {
    const message = error.message.trim();
    const looksUserFacing =
      message.length > 0 && message.length <= 240 && !INTERNAL_MARKERS.test(message);
    if (looksUserFacing) {
      const forbidden = /permission|not allowed|do not have access|not assigned|access denied/i.test(message);
      const notFound = /not found|does not exist/i.test(message);
      const code = forbidden ? "forbidden" : notFound ? "not_found" : "invalid_input";
      return {
        result: formatToolError(sanitizeErrorMessage(message, 240) || GENERIC_ERROR_MESSAGE, code),
        unexpected: false,
        code,
      };
    }
  }
  return {
    result: formatToolError(`${GENERIC_ERROR_MESSAGE} (request ${requestId})`, "internal"),
    unexpected: true,
    code: "internal",
  };
}
