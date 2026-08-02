import process from "node:process";

export const jsonSchemaVersion = 1;

export type ErrorCode =
  | "INVALID_ARGUMENT"
  | "MISSING_ARGUMENT"
  | "MISSING_SECRET"
  | "INVALID_SECRET_SOURCE"
  | "INVALID_CONFIGURATION"
  | "UNSUPPORTED_PROVIDER"
  | "PREFLIGHT_FAILED"
  | "REMOTE_OPERATION_FAILED"
  | "READINESS_TIMEOUT"
  | "PARTIAL_PROVISIONING"
  | "CANCELLED"
  | "INTERNAL_ERROR";

export type CliResult = Record<string, unknown> & {
  schemaVersion: number;
  ok: boolean;
  status: string;
  command: string;
  error?: { code: ErrorCode; message: string; field?: string };
};

export function resultOk(
  command: string,
  status: string,
  fields: Record<string, unknown> = {},
): CliResult {
  return { schemaVersion: jsonSchemaVersion, ok: true, status, command, ...fields };
}

export function resultError(
  command: string,
  status: string,
  code: ErrorCode,
  message: string,
  fields: Record<string, unknown> = {},
): CliResult {
  return {
    schemaVersion: jsonSchemaVersion,
    ok: false,
    status,
    command,
    error: { code, message },
    ...fields,
  };
}

export function emitJson(value: CliResult): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export function errorCodeFor(error: unknown): ErrorCode {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code as ErrorCode;
  }
  return "INTERNAL_ERROR";
}
