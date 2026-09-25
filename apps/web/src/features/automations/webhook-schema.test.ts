import { describe, expect, it } from "vitest";

import {
  assertWorkflowWebhookPayloadSchema,
  validateWorkflowWebhookPayload,
} from "./webhook-schema";

describe("workflow webhook JSON Schema", () => {
  const schema = {
    type: "object",
    required: ["event", "candidate"],
    additionalProperties: false,
    properties: {
      event: { type: "string", enum: ["candidate.created", "candidate.updated"] },
      candidate: {
        type: "object",
        required: ["email"],
        properties: { email: { type: "string", format: "email" } },
      },
    },
  };

  it("accepts standard schema rules and validates a matching payload", () => {
    expect(assertWorkflowWebhookPayloadSchema(schema)).toEqual(schema);
    expect(validateWorkflowWebhookPayload(schema, {
      event: "candidate.created",
      candidate: { email: "recruiting@example.test" },
    })).toEqual({ valid: true });
  });

  it("returns bounded field-oriented errors without echoing payload values", () => {
    const result = validateWorkflowWebhookPayload(schema, {
      event: "candidate.created",
      candidate: { email: "candidate-secret-value" },
      extra: true,
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.kind).toBe("payload");
      expect(result.issues.join(" ")).not.toContain("candidate-secret-value");
      expect(result.issues.length).toBeLessThanOrEqual(5);
    }
  });

  it("rejects malformed schemas before they can be persisted", () => {
    const malformed = { type: "object", properties: { value: { type: "unsupported" } } };
    expect(() => assertWorkflowWebhookPayloadSchema(malformed))
      .toThrow(/Invalid payload schema/);
    expect(() => assertWorkflowWebhookPayloadSchema({ type: "string" }))
      .toThrow(/root payload schema must accept a JSON object/);
    expect(() => assertWorkflowWebhookPayloadSchema({
      type: "object",
      properties: { value: { $ref: "https://example.invalid/schema.json" } },
    })).toThrow(/Invalid payload schema/);
    expect(validateWorkflowWebhookPayload(malformed, {}))
      .toMatchObject({ valid: false, kind: "schema" });
  });

  it("rejects oversized and deeply nested schema definitions", () => {
    expect(() => assertWorkflowWebhookPayloadSchema({ description: "x".repeat(33 * 1024) }))
      .toThrow(/32 KB or smaller/);
    let nested: Record<string, unknown> = { type: "string" };
    for (let depth = 0; depth < 26; depth += 1) nested = { properties: { value: nested } };
    expect(() => assertWorkflowWebhookPayloadSchema(nested)).toThrow(/too complex/);
  });

  it("keeps the default empty schema compatible with arbitrary object payloads", () => {
    expect(validateWorkflowWebhookPayload({}, { any: [1, "two", null] })).toEqual({ valid: true });
  });
});
