import { describe, expect, it, vi } from "vitest";

import { makeT } from "@/test-support/translator";
import { AI_PROVIDERS, AI_PROVIDER_IDS } from "./providers";
import { getModel, resolveBaseUrl, splitAzureEndpoint } from "./registry";

const tProviders = makeT("labels.ai.providers");

describe("provider registry", () => {
  it("has one catalog entry per provider id, with stable fields", () => {
    expect(AI_PROVIDERS.map((p) => p.id).sort()).toEqual([...AI_PROVIDER_IDS].sort());
    for (const p of AI_PROVIDERS) {
      expect(p.label).toBeTruthy();
      expect(tProviders(`${p.id}.tagline`), `${p.id} needs a tagline`).toBeTruthy();
      expect(p.modelExample).toBeTruthy();
      expect(p.allowedHosts.length).toBeGreaterThan(0);
    }
  });

  it("builds a client for every provider", () => {
    for (const p of AI_PROVIDERS) {
      const baseUrl = p.requiresBaseUrl
        ? p.id === "azure"
          ? "https://res.openai.azure.com/openai/v1"
          : "https://llm.example.com/v1"
        : undefined;
      const model = getModel({
        provider: p.id,
        modelId: p.modelExample,
        apiKey: "k",
        baseUrl: p.id === "ollama" ? "https://ollama.example.com/v1" : baseUrl,
      });
      expect(model).toBeTruthy();
    }
  });

  it("sends requests to the custom base URL", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input instanceof Request ? input.url : input));
        return new Response("{}", { status: 500 });
      }),
    );
    const model = getModel({
      provider: "openai-compatible",
      modelId: "m",
      apiKey: "k",
      baseUrl: "https://gateway.example.com/v1",
    });
    await (
      model as unknown as {
        doGenerate: (options: unknown) => Promise<unknown>;
      }
    )
      .doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }] })
      .catch(() => undefined);
    vi.unstubAllGlobals();
    expect(calls[0]).toBe("https://gateway.example.com/v1/chat/completions");
  });

  it("rejects an unsafe base URL when building the client", () => {
    expect(() =>
      getModel({ provider: "openai", modelId: "m", apiKey: "k", baseUrl: "https://evil.example.com" }),
    ).toThrow(/Host not allowed/);
  });

  it("requires an endpoint where there is no default", () => {
    expect(() => getModel({ provider: "azure", modelId: "d", apiKey: "k" })).toThrow(/endpoint/i);
    expect(() => getModel({ provider: "openai-compatible", modelId: "m", apiKey: "" })).toThrow(/endpoint/i);
  });

  it("falls back to the provider default only for generic providers", () => {
    expect(resolveBaseUrl({ provider: "ollama" })).toBe("http://localhost:11434/v1");
    expect(resolveBaseUrl({ provider: "openai" })).toBeUndefined();
    expect(resolveBaseUrl({ provider: "openai", baseUrl: "https://api.openai.com/v1" })).toBe(
      "https://api.openai.com/v1",
    );
  });

  it("splits the Azure api-version off the base URL", () => {
    expect(splitAzureEndpoint("https://r.openai.azure.com/openai/v1?api-version=2025-04-01-preview")).toEqual({
      baseURL: "https://r.openai.azure.com/openai/v1",
      apiVersion: "2025-04-01-preview",
    });
    expect(splitAzureEndpoint("https://r.openai.azure.com/openai/v1").apiVersion).toBeNull();
  });
});
