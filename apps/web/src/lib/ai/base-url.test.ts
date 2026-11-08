import { afterEach, describe, expect, it } from "vitest";

import { assertSafeAiBaseUrl } from "./base-url";

const off = {} as NodeJS.ProcessEnv;
const on = { HARLY_ALLOW_LOCAL_LLM: "1" } as unknown as NodeJS.ProcessEnv;

afterEach(() => {
  delete process.env.HARLY_ALLOW_LOCAL_LLM;
});

describe("assertSafeAiBaseUrl", () => {
  it("allows undefined / empty (provider default)", () => {
    expect(() => assertSafeAiBaseUrl("openai", undefined, off)).not.toThrow();
    expect(() => assertSafeAiBaseUrl("openai", "", off)).not.toThrow();
  });

  it("allows a hosted provider's own host", () => {
    expect(() => assertSafeAiBaseUrl("openai", "https://api.openai.com/v1", off)).not.toThrow();
    expect(() => assertSafeAiBaseUrl("groq", "https://api.groq.com/openai/v1", off)).not.toThrow();
    expect(() => assertSafeAiBaseUrl("togetherai", "https://api.together.ai/v1", off)).not.toThrow();
  });

  it("rejects other hosts with a message that points at OpenAI-compatible", () => {
    expect(() => assertSafeAiBaseUrl("openai", "https://evil.example.com/v1", off)).toThrow(
      /Host not allowed for OpenAI[\s\S]*OpenAI-compatible/,
    );
  });

  it("rejects plain http and credentials in the URL", () => {
    expect(() => assertSafeAiBaseUrl("openai", "http://api.openai.com/v1", off)).toThrow(/https/i);
    expect(() =>
      assertSafeAiBaseUrl("openai-compatible", "https://u:p@llm.example.com/v1", off),
    ).toThrow(/username/i);
  });

  it("rejects internal / metadata endpoints (SSRF) for hosted providers", () => {
    expect(() => assertSafeAiBaseUrl("openai", "http://169.254.169.254/", on)).toThrow(/Host not allowed/);
    expect(() => assertSafeAiBaseUrl("openai", "http://10.0.0.5:8080", on)).toThrow(/Host not allowed/);
  });

  it("blocks metadata endpoints even for OpenAI-compatible", () => {
    // Link-local metadata is "private", so it is only reachable with the flag
    // for generic providers; without it, it is always refused.
    expect(() =>
      assertSafeAiBaseUrl("openai-compatible", "http://169.254.169.254/v1", off),
    ).toThrow(/HARLY_ALLOW_LOCAL_LLM/);
  });

  it("OpenAI-compatible accepts any public https host", () => {
    expect(() =>
      assertSafeAiBaseUrl("openai-compatible", "https://litellm.my-company.io/v1", off),
    ).not.toThrow();
    expect(() => assertSafeAiBaseUrl("openai-compatible", "http://litellm.my-company.io/v1", off)).toThrow(
      /https/i,
    );
  });

  it("localhost needs the flag (hosted and generic providers)", () => {
    expect(() => assertSafeAiBaseUrl("openai", "http://localhost:11434/v1", off)).toThrow(
      /HARLY_ALLOW_LOCAL_LLM/,
    );
    expect(() => assertSafeAiBaseUrl("ollama", "http://localhost:11434/v1", off)).toThrow(
      /HARLY_ALLOW_LOCAL_LLM/,
    );
    expect(() => assertSafeAiBaseUrl("ollama", "http://localhost:11434/v1", on)).not.toThrow();
    expect(() => assertSafeAiBaseUrl("openai", "http://localhost:11434/v1", on)).not.toThrow();
  });

  it("LAN addresses need the flag and a provider that allows private hosts", () => {
    expect(() => assertSafeAiBaseUrl("openai-compatible", "http://192.168.1.20:1234/v1", off)).toThrow(
      /HARLY_ALLOW_LOCAL_LLM/,
    );
    expect(() => assertSafeAiBaseUrl("openai-compatible", "http://192.168.1.20:1234/v1", on)).not.toThrow();
    expect(() => assertSafeAiBaseUrl("anthropic", "http://192.168.1.20:1234/v1", on)).toThrow(
      /Host not allowed for Anthropic/,
    );
  });

  it("Azure only accepts Azure domains", () => {
    expect(() =>
      assertSafeAiBaseUrl("azure", "https://res.openai.azure.com/openai/v1", off),
    ).not.toThrow();
    expect(() => assertSafeAiBaseUrl("azure", "https://res.example.com/openai/v1", off)).toThrow(
      /Host not allowed for Azure/,
    );
  });

  it("rejects malformed urls and unknown providers", () => {
    expect(() => assertSafeAiBaseUrl("openai", "not-a-url", off)).toThrow(/invalid/i);
    expect(() => assertSafeAiBaseUrl("nope", "https://x.com", off)).toThrow(/unknown/i);
  });

  it("reads HARLY_ALLOW_LOCAL_LLM from process.env by default", () => {
    process.env.HARLY_ALLOW_LOCAL_LLM = "1";
    expect(() => assertSafeAiBaseUrl("ollama", "http://localhost:11434/v1")).not.toThrow();
  });
});
