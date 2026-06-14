/**
 * Typed API errors. Route handlers throw these; the transport layer
 * (server/api/respond) catches and renders them into the error envelope with
 * the right HTTP status.
 */
export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "unprocessable"
  | "rate_limited"
  | "internal";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  unprocessable: 422,
  rate_limited: 429,
  internal: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }

  static badRequest(message = "Invalid request.", details?: unknown) {
    return new ApiError("bad_request", message, details);
  }
  static unauthorized(message = "Invalid or missing API key.") {
    return new ApiError("unauthorized", message);
  }
  static forbidden(message = "This key lacks the required scope.") {
    return new ApiError("forbidden", message);
  }
  static notFound(message = "Resource not found.") {
    return new ApiError("not_found", message);
  }
  static conflict(message = "Resource already exists.") {
    return new ApiError("conflict", message);
  }
  static unprocessable(message = "Validation failed.", details?: unknown) {
    return new ApiError("unprocessable", message, details);
  }
  static rateLimited(message = "Too many requests.") {
    return new ApiError("rate_limited", message);
  }
  static internal(message = "Something went wrong.") {
    return new ApiError("internal", message);
  }
}

export function statusForCode(code: ApiErrorCode): number {
  return STATUS_BY_CODE[code];
}
