import { describe, expect, it } from "vitest";

import { assertSafeAiBaseUrl } from "./base-url";

describe("assertSafeAiBaseUrl (IA-03)", () => {
  it("allows undefined (provider default)", () => {
    expect(() => assertSafeAiBaseUrl("openai", undefined)).not.toThrow();
  });

  it("allows the provider's own host", () => {
    expect(() =>
      assertSafeAiBaseUrl("openai", "https://api.openai.com/v1"),
    ).not.toThrow();
    expect(() =>
      assertSafeAiBaseUrl("anthropic", "https://api.anthropic.com/v1"),
    ).not.toThrow();
  });

  it("rejects non-https schemes", () => {
    expect(() => assertSafeAiBaseUrl("openai", "http://api.openai.com/v1")).toThrow(
      /https/i,
    );
  });

  it("rejects a host that is not the provider's", () => {
    expect(() =>
      assertSafeAiBaseUrl("openai", "https://evil.example.com/v1"),
    ).toThrow(/openai host/i);
  });

  it("rejects internal / metadata endpoints (SSRF)", () => {
    expect(() => assertSafeAiBaseUrl("openai", "http://169.254.169.254/")).toThrow(
      /blocked host/i,
    );
    expect(() => assertSafeAiBaseUrl("openai", "http://127.0.0.1:8080")).toThrow(
      /blocked host/i,
    );
  });

  it("rejects localhost unless local LLMs are opted in", () => {
    expect(() => assertSafeAiBaseUrl("openai", "http://localhost:11434")).toThrow(
      /HARLY_ALLOW_LOCAL_LLM/i,
    );
  });

  it("allows localhost only when opted in", () => {
    const prev = process.env.HARLY_ALLOW_LOCAL_LLM;
    process.env.HARLY_ALLOW_LOCAL_LLM = "1";
    try {
      expect(() =>
        assertSafeAiBaseUrl("openai", "http://localhost:11434/v1"),
      ).not.toThrow();
    } finally {
      if (prev === undefined) delete process.env.HARLY_ALLOW_LOCAL_LLM;
      else process.env.HARLY_ALLOW_LOCAL_LLM = prev;
    }

    delete process.env.HARLY_ALLOW_LOCAL_LLM;
    expect(() =>
      assertSafeAiBaseUrl("openai", "http://localhost:11434/v1"),
    ).toThrow(/HARLY_ALLOW_LOCAL_LLM/i);
  });

  it("rejects malformed urls", () => {
    expect(() => assertSafeAiBaseUrl("openai", "not-a-url")).toThrow(/invalid/i);
  });
});
