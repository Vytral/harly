/**
 * Pure helpers for the Webhooks settings UI: event grouping, endpoint health,
 * and the signature-verification snippets shown next to the signing secret.
 * No server-only imports, so it is shared with client components and tests.
 */

import type { useTranslations } from "next-intl";

/** Translator for the `labels.developers.webhooks` catalog namespace. */
export type WebhookTranslator = ReturnType<typeof useTranslations>;

export type EventOption = { value: string; label: string };

export type EventGroup = {
  key: string;
  label: string;
  description: string;
  events: Array<EventOption & { description: string }>;
};

const GROUP_KEYS = [
  "application",
  "candidate",
  "interview",
  "task",
  "document",
  "job",
  "mail",
  "evaluation",
  "webhook",
] as const;

/** Catalog key under `eventDescriptions` for each known event name. */
const EVENT_DESCRIPTION_KEYS: Record<string, string> = {
  "application.created": "applicationCreated",
  "application.stage_changed": "applicationStageChanged",
  "application.status_changed": "applicationStatusChanged",
  "application.hired": "applicationHired",
  "application.rejected": "applicationRejected",
  "candidate.created": "candidateCreated",
  "candidate.updated": "candidateUpdated",
  "candidate.referred": "candidateReferred",
  "candidate.referral_deleted": "candidateReferralDeleted",
  "interview.scheduled": "interviewScheduled",
  "interview.canceled": "interviewCanceled",
  "interview.completed": "interviewCompleted",
  "interview.rescheduled": "interviewRescheduled",
  "task.created": "taskCreated",
  "task.updated": "taskUpdated",
  "task.completed": "taskCompleted",
  "task.deleted": "taskDeleted",
  "document.signature_sent": "documentSignatureSent",
  "document.signature_changed": "documentSignatureChanged",
  "document.signature_voided": "documentSignatureVoided",
  "job.published": "jobPublished",
  "job.updated": "jobUpdated",
  "job.closed": "jobClosed",
  "mail.received": "mailReceived",
  "evaluation.completed": "evaluationCompleted",
  "webhook.received": "webhookReceived",
};

/** Group a flat event list by its prefix (`application.created` -> Applications). */
export function groupWebhookEvents(
  events: EventOption[],
  t: WebhookTranslator,
): EventGroup[] {
  const known = new Map<string, EventGroup>(
    GROUP_KEYS.map((key) => [
      key,
      {
        key,
        label: t(`groups.${key}.label`),
        description: t(`groups.${key}.description`),
        events: [],
      },
    ]),
  );
  const other: EventGroup = {
    key: "other",
    label: t("groups.other.label"),
    description: t("groups.other.description"),
    events: [],
  };
  for (const event of events) {
    const group = known.get(event.value.split(".")[0]) ?? other;
    const descriptionKey = EVENT_DESCRIPTION_KEYS[event.value];
    group.events.push({
      ...event,
      description: descriptionKey ? t(`eventDescriptions.${descriptionKey}`) : "",
    });
  }
  return [...known.values(), other].filter((g) => g.events.length > 0);
}

/** Select or clear a whole set of values in one go. */
export function setAll(
  selected: string[],
  values: string[],
  on: boolean,
): string[] {
  const rest = selected.filter((v) => !values.includes(v));
  return on ? [...rest, ...values] : rest;
}

export function selectionState(
  selected: string[],
  values: string[],
): "all" | "some" | "none" {
  const count = values.filter((v) => selected.includes(v)).length;
  if (count === 0) return "none";
  return count === values.length ? "all" : "some";
}

export type DeliveryLike = {
  status: string;
  responseStatus: number | null;
  deliveredAt: string | null;
  createdAt: string;
} | null;

export type EndpointHealth = "active" | "paused" | "failing" | "new";

/** `failing` means the latest delivery did not succeed (retries may be queued). */
export function endpointHealth(
  enabled: boolean,
  last: DeliveryLike,
): EndpointHealth {
  if (!enabled) return "paused";
  if (!last) return "new";
  if (last.status === "failed" || last.status === "dead_letter") return "failing";
  return "active";
}

export function summarizeDeliveries(list: Array<{ status: string }>): {
  total: number;
  success: number;
  failed: number;
} {
  const success = list.filter((d) => d.status === "success").length;
  const failed = list.filter(
    (d) => d.status === "failed" || d.status === "dead_letter",
  ).length;
  return { total: list.length, success, failed };
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

/** `https://hooks.example.com/a/very/long/path` -> host + shortened path. */
export function shortUrl(url: string, max = 56): string {
  const bare = url.replace(/^https?:\/\//, "");
  if (bare.length <= max) return bare;
  return `${bare.slice(0, max - 1)}…`;
}

export const VERIFY_SNIPPETS = {
  node: `import crypto from "node:crypto";

// Verify against the RAW request body, before any JSON parsing.
export function verifyHarlySignature(rawBody, header, secret, toleranceSeconds = 300) {
  const parts = Object.fromEntries((header ?? "").split(",").map((p) => p.split("=")));
  const t = Number(parts.t);
  if (!t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${t}.\${rawBody}\`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Express: app.post("/webhooks/harly", express.raw({ type: "application/json" }), (req, res) => {
//   const ok = verifyHarlySignature(
//     req.body.toString("utf8"),
//     req.get("x-harly-signature-256"),
//     process.env.HARLY_WEBHOOK_SECRET,
//   );
//   if (!ok) return res.sendStatus(400);
//   res.sendStatus(200);
// });`,
  python: `import hashlib
import hmac
import time


def verify_harly_signature(raw_body: bytes, header: str, secret: str, tolerance: int = 300) -> bool:
    """Verify against the RAW request body, before any JSON parsing."""
    parts = dict(p.split("=", 1) for p in (header or "").split(",") if "=" in p)
    t, v1 = parts.get("t"), parts.get("v1")
    if not t or not v1 or abs(time.time() - int(t)) > tolerance:
        return False
    signed = f"{t}.".encode() + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1)


# Flask: verify_harly_signature(request.get_data(), request.headers.get("X-Harly-Signature-256"), SECRET)`,
} as const;

export type VerifyLanguage = keyof typeof VERIFY_SNIPPETS;
