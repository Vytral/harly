import { jsonValueSchema, type JsonValue } from "./definition/schema-v2";

const MAX_PAYLOAD_BYTES = 32 * 1024;
const MAX_PAYLOAD_DEPTH = 24;
const MAX_PAYLOAD_NODES = 2_000;
const encoder = new TextEncoder();

export type WebhookSimulationPayloadResult =
  | { valid: true; payload: Record<string, JsonValue> }
  | { valid: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBoundedJson(
  value: unknown,
  depth: number,
  budget: { bytes: number; nodes: number },
): boolean {
  budget.nodes += 1;
  if (budget.nodes > MAX_PAYLOAD_NODES || depth > MAX_PAYLOAD_DEPTH) {
    return false;
  }

  if (typeof value === "string") {
    budget.bytes += encoder.encode(value).byteLength + 2;
  } else if (typeof value === "number") {
    if (!Number.isFinite(value)) return false;
    budget.bytes += String(value).length;
  } else if (value === null || typeof value === "boolean") {
    budget.bytes += value === null ? 4 : 5;
  } else if (Array.isArray(value)) {
    budget.bytes += 2;
    return value.every((item, index) => {
      if (index > 0) budget.bytes += 1;
      return isBoundedJson(item, depth + 1, budget);
    });
  } else if (isRecord(value)) {
    budget.bytes += 2;
    return Object.entries(value).every(([key, item], index) => {
      budget.bytes += encoder.encode(key).byteLength + 3;
      if (index > 0) budget.bytes += 1;
      return key.length <= 256 && isBoundedJson(item, depth + 1, budget);
    });
  } else {
    return false;
  }

  return budget.bytes <= MAX_PAYLOAD_BYTES;
}

/** Validate the webhook body again on the server-action boundary. */
export function validateWebhookSimulationPayload(
  value: unknown,
): WebhookSimulationPayloadResult {
  if (!isRecord(value)) {
    return { valid: false, error: "Webhook payload must be a JSON object." };
  }
  if (!isBoundedJson(value, 0, { bytes: 0, nodes: 0 })) {
    return {
      valid: false,
      error:
        "Webhook payload must be 32 KB or smaller and contain bounded JSON values.",
    };
  }

  const parsed = jsonValueSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data === null ||
    Array.isArray(parsed.data) ||
    typeof parsed.data !== "object"
  ) {
    return {
      valid: false,
      error: "Webhook payload must be a valid JSON object.",
    };
  }

  return {
    valid: true,
    payload: parsed.data as Record<string, JsonValue>,
  };
}

/** Parse the editor's raw JSON while returning safe, user-facing errors. */
export function parseWebhookSimulationPayload(
  raw: string,
): WebhookSimulationPayloadResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { valid: false, error: "Enter valid JSON for the webhook payload." };
  }
  return validateWebhookSimulationPayload(value);
}
