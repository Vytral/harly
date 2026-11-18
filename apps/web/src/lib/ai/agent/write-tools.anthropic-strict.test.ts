import { asSchema } from "ai";
import { describe, expect, it } from "vitest";

import { toolsForProvider } from "@/lib/ai/provider-tools";

import { buildWriteTools } from "./write-tools";

// Anthropic strict tools reject these keywords ("tools.N.custom: For 'integer'
// type, properties maximum, minimum are not supported").
const UNSUPPORTED = /"(minimum|maximum|exclusiveMinimum|exclusiveMaximum|multipleOf|minLength|maxLength|maxItems)"/;

describe("write tools sent to Anthropic", () => {
  it("contain no keyword Anthropic strict mode rejects", async () => {
    const tools = toolsForProvider(buildWriteTools() as Record<string, never>, "anthropic") as Record<
      string,
      { strict?: boolean; inputSchema: Parameters<typeof asSchema>[0] }
    >;
    const offenders: string[] = [];
    for (const [name, t] of Object.entries(tools)) {
      if (!t.strict) continue;
      const json = JSON.stringify(await asSchema(t.inputSchema).jsonSchema);
      if (UNSUPPORTED.test(json)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });
});
