/**
 * Single source of truth for "is AI usable for this workspace" , client-safe
 * half (no server imports). Server half: `./availability.ts`. Client half:
 * `@/components/ai/AiAvailability` (`useAiEnabled`, `<AiOnly>`).
 */

/** Typed error code every AI-dependent endpoint/action returns when AI is off. */
export const AI_NOT_CONFIGURED_CODE = "ai_not_configured" as const;

export const AI_NOT_CONFIGURED_MESSAGE =
  "AI isn't set up for this workspace. Connect an AI provider in Settings to use this.";

export type AiNotConfiguredResult = {
  ok: false;
  code: typeof AI_NOT_CONFIGURED_CODE;
  error: string;
};

/** Spreadable into any `{ ok: false; error: string }` action result. */
export function aiNotConfiguredResult(): AiNotConfiguredResult {
  return {
    ok: false,
    code: AI_NOT_CONFIGURED_CODE,
    error: AI_NOT_CONFIGURED_MESSAGE,
  };
}

export function isAiNotConfiguredResult(
  value: unknown,
): value is AiNotConfiguredResult {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { code?: unknown }).code === AI_NOT_CONFIGURED_CODE
  );
}

/** Throwable variant for server code that is not result-shaped. */
export class AiNotConfiguredError extends Error {
  readonly code = AI_NOT_CONFIGURED_CODE;
  constructor(message: string = AI_NOT_CONFIGURED_MESSAGE) {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

export function isAiNotConfiguredError(
  error: unknown,
): error is AiNotConfiguredError {
  return (
    error instanceof AiNotConfiguredError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === AI_NOT_CONFIGURED_CODE)
  );
}

/** The slice of the workspace AI status the usability rule needs. */
export type AiUsabilityInput = {
  enabled: boolean;
  hasApiKey: boolean;
  encryptionReady: boolean;
};

/** The one rule: toggled on, a key stored, and the master key able to decrypt it. */
export function isAiUsable(status: AiUsabilityInput): boolean {
  return status.enabled && status.hasApiKey && status.encryptionReady;
}
