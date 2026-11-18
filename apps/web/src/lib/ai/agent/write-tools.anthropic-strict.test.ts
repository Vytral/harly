import { describe, expect, it } from "vitest";

import { toolsForProvider } from "@/lib/ai/provider-tools";

import { buildWriteTools } from "./write-tools";

// Anthropic rejects strict tools with numeric bounds and more than 20 strict
// tools per request, so no tool may reach it marked strict.
describe("write tools sent to Anthropic", () => {
  it("are not marked strict", () => {
    const tools = toolsForProvider(buildWriteTools() as Record<string, never>, "anthropic") as Record<
      string,
      { strict?: boolean }
    >;
    expect(Object.entries(tools).filter(([, t]) => t.strict).map(([n]) => n)).toEqual([]);
  });
});
