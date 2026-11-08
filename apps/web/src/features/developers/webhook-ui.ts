/**
 * Pure helpers for the Webhooks settings UI: event grouping, endpoint health,
 * and the signature-verification snippets shown next to the signing secret.
 * No server-only imports, so it is shared with client components and tests.
 */

export type EventOption = { value: string; label: string };

export type EventGroup = {
  key: string;
  label: string;
  description: string;
  events: Array<EventOption & { description: string }>;
};

const GROUPS: Array<{ key: string; label: string; description: string }> = [
  { key: "application", label: "Applications", description: "Candidates applying and moving through the pipeline." },
  { key: "candidate", label: "Candidates", description: "Candidate profiles and referrals." },
  { key: "interview", label: "Interviews", description: "Scheduling and outcomes." },
  { key: "task", label: "Tasks", description: "Follow-ups assigned to your team." },
  { key: "document", label: "Documents", description: "E-signature requests." },
  { key: "job", label: "Jobs", description: "Publishing and closing roles." },
  { key: "mail", label: "Mail", description: "Inbound email linked to candidates." },
  { key: "evaluation", label: "AI", description: "AI-generated evaluations." },
  { key: "webhook", label: "Integrations", description: "Payloads received from other tools." },
];

export const EVENT_DESCRIPTIONS: Record<string, string> = {
  "application.created": "A candidate submits an application.",
  "application.stage_changed": "An application moves to another pipeline stage.",
  "application.status_changed": "An application is activated, put on hold or withdrawn.",
  "application.hired": "A candidate is marked as hired.",
  "application.rejected": "An application is rejected.",
  "candidate.created": "A candidate profile is created.",
  "candidate.updated": "A candidate profile changes.",
  "candidate.referred": "Someone refers a candidate.",
  "candidate.referral_deleted": "A referral is removed.",
  "interview.scheduled": "An interview is booked.",
  "interview.canceled": "An interview is canceled.",
  "interview.completed": "An interview is marked as completed.",
  "interview.rescheduled": "An interview moves to a new time.",
  "task.created": "A task is created.",
  "task.updated": "A task changes.",
  "task.completed": "A task is marked as done.",
  "task.deleted": "A task is deleted.",
  "document.signature_sent": "A document is sent out for signature.",
  "document.signature_changed": "A signer views or signs a document.",
  "document.signature_voided": "A signature request is voided.",
  "job.published": "A job goes live on your careers page.",
  "job.updated": "A job's details change.",
  "job.closed": "A job is closed.",
  "mail.received": "An email arrives in a candidate's thread.",
  "evaluation.completed": "An AI evaluation finishes.",
  "webhook.received": "Harly receives a payload on an inbound webhook.",
};

/** Group a flat event list by its prefix (`application.created` -> Applications). */
export function groupWebhookEvents(events: EventOption[]): EventGroup[] {
  const known = new Map<string, EventGroup>(
    GROUPS.map((g) => [g.key, { ...g, events: [] }]),
  );
  const other: EventGroup = {
    key: "other",
    label: "Other",
    description: "Additional events.",
    events: [],
  };
  for (const event of events) {
    const group = known.get(event.value.split(".")[0]) ?? other;
    group.events.push({
      ...event,
      description: EVENT_DESCRIPTIONS[event.value] ?? "",
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
