import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));
vi.mock("@harly/db", () => ({ db: {}, workspaceSettings: {} }));
vi.mock("@/lib/crypto", () => ({
  decryptSecret: vi.fn(),
  isEncryptionConfigured: () => false,
}));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ warn: m.warn, error: vi.fn(), info: vi.fn() }),
}));

import { verifyCaptchaToken } from "./captcha";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("TURNSTILE_SECRET_KEY", "secret-for-tests");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("verifyCaptchaToken", () => {
  it("accepts a successful provider answer and sends a timeout signal", async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ success: true }) });
    expect(await verifyCaptchaToken("tok", "ws1", "203.0.113.1")).toBe(true);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("fails closed when the provider reply is not JSON", async () => {
    fetchMock.mockResolvedValue({
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });
    expect(await verifyCaptchaToken("tok", "ws1")).toBe(false);
  });

  it("fails closed when the provider times out or is unreachable", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    expect(await verifyCaptchaToken("tok", "ws1")).toBe(false);
  });

  it("fails closed on a null or malformed body", async () => {
    fetchMock.mockResolvedValue({ json: async () => null });
    expect(await verifyCaptchaToken("tok", "ws1")).toBe(false);
  });

  it("requires a token when enforced", async () => {
    expect(await verifyCaptchaToken(null, "ws1")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("warns (once) and skips verification when no provider is configured", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("RECAPTCHA_SECRET_KEY", "");
    vi.stubEnv("HCAPTCHA_SECRET_KEY", "");
    expect(await verifyCaptchaToken("tok", "ws1")).toBe(true);
    expect(await verifyCaptchaToken("tok", "ws1")).toBe(true);
    expect(m.warn).toHaveBeenCalledTimes(1);
  });
});
