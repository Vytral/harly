import { describe, expect, it } from "vitest";

import { AI_PROVIDERS, formatModelLabel, getProvider } from "./providers";

describe("AI provider catalog", () => {
  it("contains current text-capable model IDs for each first-party provider", () => {
    expect(getProvider("openai")?.models.map((model) => model.id)).toEqual([
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.4-nano",
      "gpt-5-mini",
      "gpt-5-nano",
    ]);
    expect(getProvider("anthropic")?.models.map((model) => model.id)).toEqual([
      "claude-fable-5",
      "claude-opus-5",
      "claude-sonnet-5",
      "claude-opus-4-8",
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-sonnet-4-6",
      "claude-sonnet-4-5",
      "claude-haiku-4-5",
      "claude-opus-4-5-20251101",
      "claude-sonnet-4-5-20250929",
      "claude-haiku-4-5-20251001",
    ]);
    expect(getProvider("google")?.models.map((model) => model.id)).toEqual([
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-3.1-pro-preview",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
    ]);
    expect(getProvider("xai")?.models.map((model) => model.id)).toEqual([
      "grok-4.5",
      "grok-4.3",
    ]);
  });

  it("does not expose retired model IDs in the curated catalog", () => {
    const ids = AI_PROVIDERS.flatMap((provider) =>
      provider.models.map((model) => model.id),
    );

    expect(ids).not.toEqual(
      expect.arrayContaining([
        "claude-3-5-haiku",
        "gemini-2.0-flash",
        "grok-3",
      ]),
    );
  });

  it("formats the current model families for the settings UI", () => {
    expect(formatModelLabel("gpt-5.6-terra")).toBe("Gpt 5.6 Terra");
    expect(formatModelLabel("gemini-3.5-flash-lite")).toBe(
      "Gemini 3.5 Flash Lite",
    );
  });
});
