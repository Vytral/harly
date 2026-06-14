import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Outbound webhook signing — Stripe-style. The signature header is
 * `x-harly-signature-256: t=<unix>,v1=<hex>` where the HMAC-SHA256 is computed
 * over `${t}.${rawBody}` keyed by the endpoint secret. Including the timestamp
 * lets receivers reject replayed deliveries.
 */
export const SIGNATURE_HEADER = "x-harly-signature-256";
export const EVENT_HEADER = "x-harly-event";

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function signWebhookPayload(input: {
  secret: string;
  body: string;
  timestamp: number;
}): string {
  const signature = createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.body}`)
    .digest("hex");
  return `t=${input.timestamp},v1=${signature}`;
}

/** Verify a received signature header. Tolerance defaults to 5 minutes. */
export function verifyWebhookSignature(input: {
  secret: string;
  body: string;
  header: string | null;
  toleranceSeconds?: number;
  now?: number;
}): boolean {
  if (!input.header) return false;
  const parts = Object.fromEntries(
    input.header.split(",").map((kv) => kv.split("=") as [string, string]),
  );
  const t = Number.parseInt(parts.t ?? "", 10);
  const v1 = parts.v1;
  if (Number.isNaN(t) || !v1) return false;

  const now = input.now ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? 300;
  if (Math.abs(now - t) > tolerance) return false;

  const expected = createHmac("sha256", input.secret)
    .update(`${t}.${input.body}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
