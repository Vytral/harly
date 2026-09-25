import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { and, eq } from "drizzle-orm";
import {
  db,
  domainEventOutbox,
  workflowDefinitions,
  workflowWebhookEndpoints,
  workflowWebhookReceipts,
} from "@harly/db";

import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getHarlyPublicOrigin } from "@/lib/public-origin";
import { assertNotDemo } from "@/features/demo/assert-not-demo";
import {
  assertWorkflowWebhookPayloadSchema,
  validateWorkflowWebhookPayload,
} from "./webhook-schema";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SIGNATURE_MAX_AGE_SECONDS = 5 * 60;
const MAX_EXTERNAL_EVENT_ID = 200;

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqualHex(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function signingPayload(timestamp: string, externalEventId: string, rawBody: string) {
  return `${timestamp}.${externalEventId}.${rawBody}`;
}

function payloadEventId(payload: Record<string, unknown>): string {
  for (const key of ["eventId", "id"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  }
  return "";
}

export type WorkflowWebhookEndpointPublic = {
  id: string;
  workflowId: string;
  name: string;
  enabled: boolean;
  lastReceivedAt: Date | null;
  payloadSchema: Record<string, unknown>;
  endpointUrl?: string;
};

export async function createWorkflowWebhookEndpoint(input: {
  workspaceId: string;
  workflowId: string;
  actorId: string;
  name: string;
  payloadSchema?: Record<string, unknown>;
}): Promise<{ endpoint: WorkflowWebhookEndpointPublic; token: string; secret: string }> {
  assertNotDemo();
  const name = input.name.trim();
  if (name.length < 1 || name.length > 120) {
    throw new Error("Webhook endpoint name must be between 1 and 120 characters.");
  }
  const payloadSchema = assertWorkflowWebhookPayloadSchema(input.payloadSchema ?? {});

  const [workflow] = await db
    .select({ id: workflowDefinitions.id })
    .from(workflowDefinitions)
    .where(and(
      eq(workflowDefinitions.id, input.workflowId),
      eq(workflowDefinitions.workspaceId, input.workspaceId),
    ))
    .limit(1);
  if (!workflow) throw new Error("Workflow not found.");

  const token = randomBytes(32).toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  const encrypted = encryptSecret(secret);
  const [created] = await db
    .insert(workflowWebhookEndpoints)
    .values({
      workspaceId: input.workspaceId,
      workflowId: workflow.id,
      name,
      tokenHash: sha256(token),
      secretCiphertext: encrypted.ciphertext,
      secretIv: encrypted.iv,
      secretTag: encrypted.tag,
      payloadSchema,
      enabled: true,
      createdById: input.actorId,
    })
    .returning({
      id: workflowWebhookEndpoints.id,
      workflowId: workflowWebhookEndpoints.workflowId,
      name: workflowWebhookEndpoints.name,
      enabled: workflowWebhookEndpoints.enabled,
      lastReceivedAt: workflowWebhookEndpoints.lastReceivedAt,
      payloadSchema: workflowWebhookEndpoints.payloadSchema,
    });
  if (!created) throw new Error("Webhook endpoint could not be created.");

  return {
    endpoint: {
      ...created,
      payloadSchema,
      endpointUrl: `${getHarlyPublicOrigin()}/api/webhooks/automations/${created.id}/${token}`,
    },
    token,
    secret,
  };
}

export async function listWorkflowWebhookEndpoints(input: {
  workspaceId: string;
  workflowId: string;
}): Promise<WorkflowWebhookEndpointPublic[]> {
  const endpoints = await db
    .select({
      id: workflowWebhookEndpoints.id,
      workflowId: workflowWebhookEndpoints.workflowId,
      name: workflowWebhookEndpoints.name,
      enabled: workflowWebhookEndpoints.enabled,
      lastReceivedAt: workflowWebhookEndpoints.lastReceivedAt,
      payloadSchema: workflowWebhookEndpoints.payloadSchema,
    })
    .from(workflowWebhookEndpoints)
    .where(and(
      eq(workflowWebhookEndpoints.workspaceId, input.workspaceId),
      eq(workflowWebhookEndpoints.workflowId, input.workflowId),
    ));
  return endpoints.map((endpoint) => ({
    ...endpoint,
    payloadSchema: endpoint.payloadSchema as Record<string, unknown>,
  }));
}

export async function setWorkflowWebhookEndpointEnabled(input: {
  workspaceId: string;
  endpointId: string;
  enabled: boolean;
}) {
  assertNotDemo();
  const [updated] = await db
    .update(workflowWebhookEndpoints)
    .set({ enabled: input.enabled, updatedAt: new Date() })
    .where(and(
      eq(workflowWebhookEndpoints.workspaceId, input.workspaceId),
      eq(workflowWebhookEndpoints.id, input.endpointId),
    ))
    .returning({ id: workflowWebhookEndpoints.id });
  return Boolean(updated);
}

export async function setWorkflowWebhookEndpointPayloadSchema(input: {
  workspaceId: string;
  endpointId: string;
  payloadSchema: unknown;
}): Promise<boolean> {
  assertNotDemo();
  const payloadSchema = assertWorkflowWebhookPayloadSchema(input.payloadSchema);
  const [updated] = await db
    .update(workflowWebhookEndpoints)
    .set({ payloadSchema, updatedAt: new Date() })
    .where(and(
      eq(workflowWebhookEndpoints.workspaceId, input.workspaceId),
      eq(workflowWebhookEndpoints.id, input.endpointId),
    ))
    .returning({ id: workflowWebhookEndpoints.id });
  return Boolean(updated);
}

export type WorkflowWebhookReceiptResult =
  | {
      ok: true;
      duplicate: boolean;
      eventId: string;
      workflowId: string;
      workspaceId: string;
      payload: Record<string, unknown>;
    }
  | { ok: false; status: 401 | 404 | 409 | 413 | 422 | 500; error: string };

/**
 * Verify and durably accept one inbound webhook. The endpoint token identifies
 * the tenant-scoped endpoint; the HMAC signature proves possession of the
 * second secret. The receipt and domain-event outbox share one transaction,
 * so a successful HTTP response always has a replayable automation event.
 */
export async function receiveWorkflowWebhook(input: {
  endpointId: string;
  token: string;
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  externalEventId: string | null;
}): Promise<WorkflowWebhookReceiptResult> {
  assertNotDemo();
  if (!TOKEN_PATTERN.test(input.token)) {
    return { ok: false, status: 404, error: "Webhook endpoint not found." };
  }
  if (Buffer.byteLength(input.rawBody, "utf8") > 256 * 1024) {
    return { ok: false, status: 413, error: "Webhook payload is too large." };
  }
  const signedExternalEventId = input.externalEventId?.trim() ?? "";
  if (signedExternalEventId.length > MAX_EXTERNAL_EVENT_ID) {
    return { ok: false, status: 422, error: `External event id must be ${MAX_EXTERNAL_EVENT_ID} characters or fewer.` };
  }

  const [endpoint] = await db
    .select({
      id: workflowWebhookEndpoints.id,
      workspaceId: workflowWebhookEndpoints.workspaceId,
      workflowId: workflowWebhookEndpoints.workflowId,
      tokenHash: workflowWebhookEndpoints.tokenHash,
      enabled: workflowWebhookEndpoints.enabled,
      secretCiphertext: workflowWebhookEndpoints.secretCiphertext,
      secretIv: workflowWebhookEndpoints.secretIv,
      secretTag: workflowWebhookEndpoints.secretTag,
      payloadSchema: workflowWebhookEndpoints.payloadSchema,
    })
    .from(workflowWebhookEndpoints)
    .where(eq(workflowWebhookEndpoints.id, input.endpointId))
    .limit(1);
  if (!endpoint || !safeEqualHex(endpoint.tokenHash, sha256(input.token))) {
    return { ok: false, status: 404, error: "Webhook endpoint not found." };
  }
  if (!endpoint.enabled) {
    return { ok: false, status: 409, error: "Webhook endpoint is disabled." };
  }
  if (!input.signature || !input.timestamp || !/^\d{10,13}$/.test(input.timestamp)) {
    return { ok: false, status: 401, error: "Webhook signature is required." };
  }

  const timestampMs = Number(input.timestamp) < 10_000_000_000
    ? Number(input.timestamp) * 1_000
    : Number(input.timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > SIGNATURE_MAX_AGE_SECONDS * 1_000) {
    return { ok: false, status: 401, error: "Webhook signature has expired." };
  }
  const suppliedSignature = input.signature.replace(/^sha256=/, "");
  if (!/^[a-f0-9]{64}$/i.test(suppliedSignature)) {
    return { ok: false, status: 401, error: "Webhook signature is invalid." };
  }
  const secret = decryptSecret({
    ciphertext: endpoint.secretCiphertext,
    iv: endpoint.secretIv,
    tag: endpoint.secretTag,
  });
  const expectedSignature = createHmac("sha256", secret)
    .update(signingPayload(input.timestamp, signedExternalEventId, input.rawBody))
    .digest("hex");
  if (!safeEqualHex(expectedSignature, suppliedSignature)) {
    return { ok: false, status: 401, error: "Webhook signature is invalid." };
  }

  let incomingPayload: unknown;
  try {
    incomingPayload = JSON.parse(input.rawBody);
  } catch {
    return { ok: false, status: 422, error: "Webhook payload must be valid JSON." };
  }
  if (!incomingPayload || typeof incomingPayload !== "object" || Array.isArray(incomingPayload)) {
    return { ok: false, status: 422, error: "Webhook payload must be a JSON object." };
  }

  const payloadValidation = validateWorkflowWebhookPayload(endpoint.payloadSchema, incomingPayload);
  if (!payloadValidation.valid) {
    if (payloadValidation.kind === "schema") {
      return { ok: false, status: 500, error: "This webhook endpoint has an invalid payload schema." };
    }
    return {
      ok: false,
      status: 422,
      error: `Webhook payload does not match the endpoint schema: ${payloadValidation.issues.join("; ")}`,
    };
  }

  const candidateId = signedExternalEventId || payloadEventId(incomingPayload as Record<string, unknown>);
  const externalEventId = candidateId || sha256(input.rawBody);
  if (externalEventId.length > MAX_EXTERNAL_EVENT_ID) {
    return { ok: false, status: 422, error: `External event id must be ${MAX_EXTERNAL_EVENT_ID} characters or fewer.` };
  }
  const eventId = randomUUID();
  const eventPayload: Record<string, unknown> = {
    eventId,
    endpointId: endpoint.id,
    externalEventId,
    payload: incomingPayload as Record<string, unknown>,
  };
  const payloadHash = sha256(input.rawBody);
  const receivedAt = new Date();

  const result = await db.transaction(async (tx) => {
    const [receipt] = await tx
      .insert(workflowWebhookReceipts)
      .values({
        workspaceId: endpoint.workspaceId,
        endpointId: endpoint.id,
        externalEventId,
        eventId,
        payloadHash,
        receivedAt,
      })
      .onConflictDoNothing({
        target: [workflowWebhookReceipts.endpointId, workflowWebhookReceipts.externalEventId],
      })
      .returning({
        eventId: workflowWebhookReceipts.eventId,
        payloadHash: workflowWebhookReceipts.payloadHash,
      });
    if (!receipt) {
      const [existing] = await tx
        .select({
          eventId: workflowWebhookReceipts.eventId,
          payloadHash: workflowWebhookReceipts.payloadHash,
        })
        .from(workflowWebhookReceipts)
        .where(and(
          eq(workflowWebhookReceipts.endpointId, endpoint.id),
          eq(workflowWebhookReceipts.externalEventId, externalEventId),
        ))
        .limit(1);
      if (!existing) return { duplicate: true, eventId };
      if (existing.payloadHash !== payloadHash) {
        return { conflict: true as const };
      }
      return { duplicate: true, eventId: existing.eventId };
    }

    await tx.insert(domainEventOutbox).values({
      eventId,
      workspaceId: endpoint.workspaceId,
      eventName: "webhook.received",
      eventVersion: 1,
      schemaVersion: 1,
      aggregateType: "workflow_webhook",
      aggregateId: endpoint.workflowId,
      payload: eventPayload,
    });
    await tx
      .update(workflowWebhookEndpoints)
      .set({ lastReceivedAt: receivedAt, updatedAt: receivedAt })
      .where(eq(workflowWebhookEndpoints.id, endpoint.id));
    return { duplicate: false, eventId };
  });

  if ("conflict" in result && result.conflict) {
    return { ok: false, status: 409, error: "This external event id was already accepted with a different payload." };
  }

  return {
    ok: true,
    ...result,
    workflowId: endpoint.workflowId,
    workspaceId: endpoint.workspaceId,
    payload: eventPayload,
  };
}
