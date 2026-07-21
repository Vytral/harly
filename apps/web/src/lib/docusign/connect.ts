import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * DocuSign Connect webhook verification + payload helpers.
 *
 * HMAC is account-global (Admin → Connect → HMAC Keys), distinct from the OAuth
 * client secret, and NOT inlined in the envelope's eventNotification. Each
 * workspace stores its own Connect secret in `docusignConnectSecret`. DocuSign
 * posts X-DocuSign-Signature-1, -2, ... -N (one per active key, for zero-
 * downtime rotation); a delivery is valid if ANY received signature matches ANY
 * active secret. See docs-internal/docusign-api-reference.md §Connect HMAC.
 */

/** Constant-time base64 comparison; returns false on any decode mismatch. */
function safeBase64Equal(expected: string, received: string): boolean {
  try {
    const left = Buffer.from(expected, "base64");
    const right = Buffer.from(received.trim(), "base64");
    return (
      left.length === right.length && timingSafeEqual(left, right)
    );
  } catch {
    return false;
  }
}

/**
 * Verify a DocuSign Connect webhook. `rawBody` MUST be the exact request bytes
 * (Buffer) — read via `Buffer.from(await request.arrayBuffer())` BEFORE any
 * JSON parse. `headers` are the raw request headers (case-insensitive names).
 * `secrets` are the workspace's active HMAC keys (support rotation: pass old +
 * new until the old is retired).
 */
export function verifyDocuSignHmac(
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
  secrets: string[],
): boolean {
  if (secrets.length === 0) return false;
  const signatures = Object.entries(headers)
    .filter(([name]) => /^x-docusign-signature-\d+$/i.test(name))
    .flatMap(([, value]) =>
      Array.isArray(value) ? value : value ? [value] : [],
    );
  if (signatures.length === 0) return false;

  return secrets.some((secret) => {
    const expected = createHmac("sha256", Buffer.from(secret, "utf8"))
      .update(rawBody)
      .digest("base64");
    return signatures.some((received) => safeBase64Equal(expected, received));
  });
}

/** Inbound webhook payload (JSON SIM). Tolerant — extra fields are ignored. */
export type DocuSignConnectEvent = {
  event: string;
  apiVersion?: string;
  uri?: string;
  retryCount?: number;
  configurationId?: number;
  generatedDateTime?: string;
  data?: {
    accountId?: string;
    userId?: string;
    envelopeId?: string;
    envelopeSummary?: {
      envelopeId?: string;
      status?: string;
      completedDateTime?: string;
      declinedDateTime?: string;
      voidedDateTime?: string;
      voidedReason?: string;
      customFields?: {
        textCustomFields?: DocuSignConnectCustomField[];
      };
      recipients?: {
        signers?: DocuSignConnectSigner[];
      };
    };
  };
};

export type DocuSignConnectCustomField = {
  name: string;
  value: string;
  show?: string;
  required?: string;
};

export type DocuSignConnectSigner = {
  recipientId?: string;
  email?: string;
  name?: string;
  status?: string;
  declinedReason?: string;
};

/**
 * Stable idempotency key for a Connect event. Connect retries and may deliver
 * duplicates or out-of-order events; dedup by this composite key.
 */
export function connectEventKey(event: DocuSignConnectEvent): string {
  const env = connectEnvelopeId(event) ?? "";
  return [
    event.configurationId ?? "",
    event.event ?? "",
    env,
    event.generatedDateTime ?? "",
  ].join("|");
}

/** Pull the envelopeId from any of the (redundant) locations in the payload. */
export function connectEnvelopeId(event: DocuSignConnectEvent): string | null {
  const direct = event.data?.envelopeId ?? event.data?.envelopeSummary?.envelopeId;
  if (direct) return direct;
  const match = event.uri?.match(/\/envelopes\/([^/?]+)/i);
  return match?.[1] ?? null;
}

/** Find a custom field value by name in the payload (secondary correlation). */
export function connectCustomField(
  event: DocuSignConnectEvent,
  name: string,
): string | null {
  const fields = event.data?.envelopeSummary?.customFields?.textCustomFields;
  if (!fields) return null;
  const found = fields.find((f) => f.name === name);
  return found?.value ?? null;
}
