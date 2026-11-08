import { describe, expect, it } from "vitest";

import {
  AI_NOT_CONFIGURED_CODE,
  AiNotConfiguredError,
  aiNotConfiguredResult,
  isAiNotConfiguredError,
  isAiNotConfiguredResult,
  isAiUsable,
} from "./availability-shared";

describe("isAiUsable", () => {
  const ok = { enabled: true, hasApiKey: true, encryptionReady: true };
  it("is true only when enabled, keyed and decryptable", () => {
    expect(isAiUsable(ok)).toBe(true);
    expect(isAiUsable({ ...ok, enabled: false })).toBe(false);
    expect(isAiUsable({ ...ok, hasApiKey: false })).toBe(false);
    expect(isAiUsable({ ...ok, encryptionReady: false })).toBe(false);
  });
});

describe("typed not-configured errors", () => {
  it("builds a result with a stable code", () => {
    const r = aiNotConfiguredResult();
    expect(r.ok).toBe(false);
    expect(r.code).toBe(AI_NOT_CONFIGURED_CODE);
    expect(isAiNotConfiguredResult(r)).toBe(true);
    expect(isAiNotConfiguredResult({ ok: false, error: "x" })).toBe(false);
  });
  it("recognises the thrown variant", () => {
    expect(isAiNotConfiguredError(new AiNotConfiguredError())).toBe(true);
    expect(isAiNotConfiguredError(new Error("boom"))).toBe(false);
  });
});
