/** Operational limits of the MCP endpoint. */

/** Largest tool result sent to a client, in characters of serialized JSON. */
export const MAX_RESULT_CHARS = 100_000;

/** Calls per user and client per minute, all tools. */
export const CALLS_PER_MINUTE = 120;
/** Of those, calls to tools that change data. */
export const WRITES_PER_MINUTE = 30;
export const RATE_WINDOW_MS = 60_000;

/** Failed token checks per client IP per minute, before any database work. */
export const AUTH_FAILURES_PER_MINUTE = 60;

/** Longest JSON-RPC body accepted. Tool inputs are small; files go by URL or base64 in tools that allow it. */
export const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
