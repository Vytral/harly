import { describe, expect, it } from "vitest";

import {
  parseWebhookSimulationPayload,
  validateWebhookSimulationPayload,
} from "./webhook-simulation";

describe("webhook simulation payload", () => {
  it("parses an object payload and preserves nested values", () => {
    expect(
      parseWebhookSimulationPayload('{"candidate":{"email":"a@example.test"}}'),
    ).toEqual({
      valid: true,
      payload: { candidate: { email: "a@example.test" } },
    });
  });

  it.each(["", "not json", "null", "[]", '"text"', "42"])(
    "rejects invalid JSON or a non-object root (%s)",
    (value) => {
      expect(parseWebhookSimulationPayload(value)).toMatchObject({
        valid: false,
      });
    },
  );

  it("bounds payload bytes and nested JSON complexity", () => {
    expect(
      parseWebhookSimulationPayload(
        JSON.stringify({ value: "x".repeat(33 * 1024) }),
      ),
    ).toMatchObject({ valid: false, error: /32 KB or smaller/ });
    expect(
      validateWebhookSimulationPayload({ value: Number.POSITIVE_INFINITY }),
    ).toMatchObject({ valid: false });
  });

  it("validates object input without trusting client-side parsing", () => {
    expect(
      validateWebhookSimulationPayload({ event: "candidate.created" }),
    ).toEqual({
      valid: true,
      payload: { event: "candidate.created" },
    });
    expect(
      validateWebhookSimulationPayload(["not", "an", "object"]),
    ).toMatchObject({ valid: false, error: /JSON object/ });
  });
});
