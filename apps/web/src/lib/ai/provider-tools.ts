import { asSchema, jsonSchema, type FlexibleSchema, type JSONSchema7 } from "ai";

import type { AiProviderId } from "./providers";

/**
 * Each provider validates tool JSON Schema differently.
 *
 * Google rejects a non-string enum, so `z.literal(1)` is sent as `"1"` and
 * coerced back to `1` before Harly validates the call. OpenAI strict mode
 * wants the numeric literal, so every other provider keeps it.
 *
 * xAI rejects two things that the AI SDK emits: `additionalProperties: false`
 * (it already defaults to closed objects) and a `$ref` that points at a
 * definition still being written (the automation condition tree). Those are
 * removed from the request body. Anthropic's non-strict tool API accepts
 * both, and strict mode is not enabled on these tools.
 */
type JsonSchema = {
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  patternProperties?: Record<string, JsonSchema>;
  $defs?: Record<string, JsonSchema>;
  definitions?: Record<string, JsonSchema>;
  items?: JsonSchema | JsonSchema[];
  additionalProperties?: JsonSchema | boolean;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  prefixItems?: JsonSchema[];
};

const SCHEMA_MAP_KEYS = ["properties", "patternProperties", "$defs", "definitions"] as const;
const SCHEMA_ARRAY_KEYS = ["anyOf", "oneOf", "allOf", "prefixItems"] as const;

type HarlyTool = { inputSchema: FlexibleSchema<unknown> };

export function toolsForProvider<Tools extends Record<string, HarlyTool>>(
  tools: Tools,
  provider: AiProviderId,
): Tools {
  if (provider !== "google") return tools;

  const adapted = {} as Tools;
  for (const [name, harlyTool] of Object.entries(tools) as Array<[keyof Tools, Tools[keyof Tools]]>) {
    adapted[name] = adaptGoogleTool(harlyTool);
  }
  return adapted;
}

function adaptGoogleTool<T extends HarlyTool>(harlyTool: T): T {
  const original = asSchema(harlyTool.inputSchema);
  let sourceSchema: JsonSchema | undefined;

  async function source(): Promise<JsonSchema> {
    if (!sourceSchema) {
      sourceSchema = (await original.jsonSchema) as JsonSchema;
    }
    return sourceSchema;
  }

  return {
    ...harlyTool,
    inputSchema: jsonSchema(
      // `JsonSchema` is the loose shape this file rewrites. It describes the
      // same JSON Schema the AI SDK does, only with every branch optional, so
      // it does not structurally satisfy `JSONSchema7` ($defs there allows a
      // boolean). The cast is at the boundary; the rewrite above stays typed.
      async () => googleJsonSchema(await source()) as JSONSchema7,
      {
        validate: async (value) => {
          const coerced = coerceGoogleValue(value, await source());
          if (!original.validate) {
            return { success: true as const, value: coerced };
          }
          return original.validate(coerced);
        },
      },
    ),
  };
}

export function googleJsonSchema(schema: JsonSchema): JsonSchema {
  const copy: JsonSchema = { ...schema };
  const enumValues = copy.enum;
  const constValue = copy.const;
  const nonString =
    enumValues?.some((value) => typeof value !== "string") ||
    (constValue !== undefined && typeof constValue !== "string");

  if (nonString) {
    const values = enumValues ?? (constValue !== undefined ? [constValue] : []);
    copy.enum = values.map((value) => (typeof value === "string" ? value : String(value)));
    delete copy.const;
    if (copy.type === "number" || copy.type === "integer") {
      copy.type = "string";
    }
  }

  for (const key of SCHEMA_MAP_KEYS) {
    const nested = copy[key];
    if (!nested) continue;
    copy[key] = Object.fromEntries(
      Object.entries(nested).map(([name, child]) => [name, googleJsonSchema(child)]),
    );
  }
  for (const key of SCHEMA_ARRAY_KEYS) {
    const nested = copy[key];
    if (!nested) continue;
    copy[key] = nested.map((child) => googleJsonSchema(child));
  }
  if (copy.items) {
    copy.items = Array.isArray(copy.items)
      ? copy.items.map((child) => googleJsonSchema(child))
      : googleJsonSchema(copy.items);
  }
  if (copy.additionalProperties && typeof copy.additionalProperties === "object") {
    copy.additionalProperties = googleJsonSchema(copy.additionalProperties);
  }
  return copy;
}

function coerceGoogleValue(value: unknown, schema: JsonSchema | undefined): unknown {
  if (!schema) return value;

  if (schema.enum?.some((entry) => typeof entry !== "string") && typeof value === "string") {
    const match = schema.enum.find((entry) => typeof entry !== "string" && String(entry) === value);
    if (match !== undefined && !schema.enum.includes(value)) return match;
  }
  if (
    schema.const !== undefined &&
    typeof schema.const !== "string" &&
    value === String(schema.const)
  ) {
    return schema.const;
  }

  const branches = schema.anyOf ?? schema.oneOf;
  if (branches && value && typeof value === "object") {
    const branch = matchBranch(value, branches);
    if (branch) return coerceGoogleValue(value, branch);
  }
  if (schema.allOf) {
    return schema.allOf.reduce((current, branch) => coerceGoogleValue(current, branch), value);
  }

  if (Array.isArray(value)) {
    const itemSchema = Array.isArray(schema.items) ? undefined : schema.items;
    if (!itemSchema) return value;
    return value.map((item) => coerceGoogleValue(item, itemSchema));
  }

  if (!value || typeof value !== "object" || !schema.properties) return value;
  const record = value as Record<string, unknown>;
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    const childSchema = schema.properties[key];
    const coerced = childSchema ? coerceGoogleValue(child, childSchema) : child;
    next[key] = coerced;
    if (coerced !== child) changed = true;
  }
  return changed ? next : value;
}

/**
 * Rewrite a JSON request body before it is sent to api.x.ai. Tool schemas and
 * structured-output schemas both travel in that body.
 */
export function prepareXaiPayload<T>(value: T): T {
  return rewriteXaiValue(value, new Set()) as T;
}

export function xaiCompatibleFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const body = init?.body;
  if (typeof body !== "string") return fetch(input, init);
  try {
    const prepared = JSON.stringify(prepareXaiPayload(JSON.parse(body)));
    return fetch(input, { ...init, body: prepared });
  } catch {
    return fetch(input, init);
  }
}

function rewriteXaiValue(value: unknown, activeDefinitions: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => rewriteXaiValue(item, activeDefinitions));
  }
  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  if (typeof record.$ref === "string" && activeDefinitions.has(record.$ref)) {
    return {
      type: "object",
      description: "Nested value. Use the same shape as its parent.",
    };
  }

  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (key === "additionalProperties" && child === false) continue;
    if (
      (key === "definitions" || key === "$defs") &&
      child &&
      typeof child === "object" &&
      !Array.isArray(child)
    ) {
      const definitions: Record<string, unknown> = {};
      for (const [name, definition] of Object.entries(child as Record<string, unknown>)) {
        const pointer = `#/${key}/${name}`;
        activeDefinitions.add(pointer);
        definitions[name] = rewriteXaiValue(definition, activeDefinitions);
        activeDefinitions.delete(pointer);
      }
      next[key] = definitions;
      continue;
    }
    next[key] = rewriteXaiValue(child, activeDefinitions);
  }
  return next;
}

function matchBranch(value: unknown, branches: JsonSchema[]): JsonSchema | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  for (const branch of branches) {
    if (!branch.properties) continue;
    for (const [key, prop] of Object.entries(branch.properties)) {
      const expected = prop.const ?? (prop.enum?.length === 1 ? prop.enum[0] : undefined);
      if (expected === undefined) continue;
      if (record[key] === expected || record[key] === String(expected)) return branch;
    }
  }
  return undefined;
}
