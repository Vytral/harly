import type { ApiErrorCode } from "./errors";

/**
 * Standard response envelope. Success: { data, meta? }. Failure: { error }.
 * Kept framework-agnostic — the transport layer wraps these in a Response.
 */
export type PaginationMeta = {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
};

export type SuccessEnvelope<T> = {
  data: T;
  meta?: { pagination?: PaginationMeta };
};

export type ErrorEnvelope = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

export function success<T>(
  data: T,
  meta?: { pagination?: PaginationMeta },
): SuccessEnvelope<T> {
  return meta ? { data, meta } : { data };
}

export function failure(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): ErrorEnvelope {
  return { error: { code, message, ...(details ? { details } : {}) } };
}
