import { asSchema, tool } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { automationPatchV1Schema, automationPlanV1Schema } from "@/features/automations/definition/plan-compiler";

import { prepareXaiPayload, toolsForProvider } from "./provider-tools";

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
