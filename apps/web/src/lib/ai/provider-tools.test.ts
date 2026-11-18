import { asSchema, tool } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { automationPatchV1Schema, automationPlanV1Schema } from "@/features/automations/definition/plan-compiler";

import { anthropicStrictJsonSchema, prepareXaiPayload, toolsForProvider } from "./provider-tools";

type JsonSchema = {
  const?: unknown;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  $defs?: Record<string, JsonSchema>;
};

function nonStringEnums(schema: JsonSchema | undefined, found: string[] = []): string[] {
  if (!schema) return found;
  const values = [
    ...(schema.enum ?? []),
    ...(schema.const !== undefined ? [schema.const] : []),
  ];
  for (const value of values) {
    if (typeof value !== "string") found.push(JSON.stringify(value));
  }
  for (const child of Object.values(schema.properties ?? {})) nonStringEnums(child, found);
  for (const child of schema.anyOf ?? []) nonStringEnums(child, found);
  for (const child of schema.oneOf ?? []) nonStringEnums(child, found);
  for (const child of schema.allOf ?? []) nonStringEnums(child, found);
  for (const child of Object.values(schema.$defs ?? {})) nonStringEnums(child, found);
  if (Array.isArray(schema.items)) schema.items.forEach((child) => nonStringEnums(child, found));
  else nonStringEnums(schema.items, found);
  return found;
}

describe("toolsForProvider", () => {
  const tools = {
    patch: tool({
      description: "Prepare an automation patch.",
      inputSchema: automationPatchV1Schema,
    }),
    plan: tool({
      description: "Prepare an automation plan.",
      inputSchema: automationPlanV1Schema,
    }),
  };

  it("leaves OpenAI, Anthropic, and xAI tool objects unchanged", () => {
    expect(toolsForProvider(tools, "openai")).toBe(tools);
    expect(toolsForProvider(tools, "anthropic")).toBe(tools);
    expect(toolsForProvider(tools, "xai")).toBe(tools);
  });

  it("makes an xAI request body acceptable without changing numeric literals", () => {
    const payload = {
      tools: [
        {
          function: {
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                version: { type: "integer", const: 1 },
                tree: { $ref: "#/definitions/condition" },
              },
              definitions: {
                condition: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    children: {
                      type: "array",
                      items: { $ref: "#/definitions/condition" },
                    },
                  },
                },
              },
            },
          },
        },
      ],
    };

    const prepared = prepareXaiPayload(payload);
    expect(prepared.tools[0]?.function.parameters.properties.version).toEqual({
      type: "integer",
      const: 1,
    });
    expect(JSON.stringify(prepared)).not.toContain('"additionalProperties":false');
    expect(prepared.tools[0]?.function.parameters.definitions.condition.properties.children.items).toEqual({
      type: "object",
      description: "Nested value. Use the same shape as its parent.",
    });
    expect(payload.tools[0]?.function.parameters.additionalProperties).toBe(false);
  });

  it("sends Gemini string enums and restores the numeric literal on input", async () => {
    const adapted = toolsForProvider(tools, "google");
    const patchSchema = (await asSchema(adapted.patch.inputSchema).jsonSchema) as JsonSchema;
    const planSchema = (await asSchema(adapted.plan.inputSchema).jsonSchema) as JsonSchema;

    expect(nonStringEnums(patchSchema)).toEqual([]);
    expect(nonStringEnums(planSchema)).toEqual([]);
    expect(JSON.stringify(patchSchema)).toContain('"1"');

    const parsed = await asSchema(adapted.patch.inputSchema).validate?.({
      version: "1",
      operations: [{ op: "renameWorkflow", name: "Follow up" }],
    });
    expect(parsed?.success).toBe(true);
    if (parsed?.success) {
      expect(parsed.value).toMatchObject({
        version: 1,
        operations: [{ op: "renameWorkflow", name: "Follow up" }],
      });
    }

    const alreadyNumeric = await asSchema(adapted.patch.inputSchema).validate?.({
      version: 1,
      operations: [{ op: "renameWorkflow", name: "Follow up" }],
    });
    expect(alreadyNumeric?.success).toBe(true);
    if (alreadyNumeric?.success) expect(alreadyNumeric.value.version).toBe(1);
  });

  it("does not rewrite a free-form string that merely looks like a version", async () => {
    const adapted = toolsForProvider(
      {
        note: tool({
          description: "Save a note.",
          inputSchema: z.object({ version: z.string(), count: z.number() }),
        }),
      },
      "google",
    );
    const parsed = await asSchema(adapted.note.inputSchema).validate?.({
      version: "1",
      count: 2,
    });
    expect(parsed?.success).toBe(true);
    if (parsed?.success) expect(parsed.value).toEqual({ version: "1", count: 2 });
  });
});

describe("Anthropic strict tools", () => {
  it("drops integer bounds from strict tool schemas but keeps validating them", async () => {
    const tools = {
      pick: tool({
        strict: true,
        description: "Pick a count.",
        inputSchema: z.object({ count: z.number().int().min(1).max(5), note: z.string().max(10) }),
      }),
      loose: tool({ description: "Not strict.", inputSchema: z.object({ n: z.number().int().min(1) }) }),
    };
    const adapted = toolsForProvider(tools, "anthropic");
    const sent = JSON.stringify(await asSchema(adapted.pick.inputSchema).jsonSchema);
    expect(sent).not.toMatch(/minimum|maximum|maxLength/);
    expect(adapted.loose).toBe(tools.loose);
    const invalid = await asSchema(adapted.pick.inputSchema).validate?.({ count: 9, note: "ok" });
    expect(invalid?.success).toBe(false);
    const valid = await asSchema(adapted.pick.inputSchema).validate?.({ count: 2, note: "ok" });
    expect(valid?.success).toBe(true);
  });

  it("strips nested bounds", () => {
    const out = anthropicStrictJsonSchema({
      type: "object",
      properties: { list: { type: "array", items: { type: "integer", minimum: 0, maximum: 9 } as never } },
    });
    expect(JSON.stringify(out)).not.toMatch(/minimum|maximum/);
  });
});
