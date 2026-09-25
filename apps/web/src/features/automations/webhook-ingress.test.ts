import { createHash, createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@harly/db", () => ({
  db: { select: mocks.select, transaction: mocks.transaction },
  domainEventOutbox: {},
  workflowDefinitions: {},
  workflowWebhookEndpoints: {
    id: "endpoint.id",
    workspaceId: "endpoint.workspaceId",
    workflowId: "endpoint.workflowId",
    tokenHash: "endpoint.tokenHash",
    enabled: "endpoint.enabled",
    secretCiphertext: "endpoint.secretCiphertext",
    secretIv: "endpoint.secretIv",
    secretTag: "endpoint.secretTag",
  },
  workflowWebhookReceipts: {
    endpointId: "receipt.endpointId",
    externalEventId: "receipt.externalEventId",
    eventId: "receipt.eventId",
    payloadHash: "receipt.payloadHash",
  },
}));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), asc: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: vi.fn(() => "secret-for-test") }));

import {
  createWorkflowWebhookEndpoint,
  receiveWorkflowWebhook,
  setWorkflowWebhookEndpointPayloadSchema,
} from "./webhook-ingress";

function query<T>(value: T) {
  const builder = new Proxy(function () {}, {
    get(_target, property) {
      if (property === "then") {
        return (resolve: (result: T) => void) => resolve(value);
      }
      return () => builder;
    },
    apply() {
      return builder;
    },
  });
  return builder;
}

function signature(timestamp: string, body: string, eventId = "") {
  return createHmac("sha256", "secret-for-test").update(`${timestamp}.${eventId}.${body}`).digest("hex");
}

describe("receiveWorkflowWebhook", () => {
  const token = "A".repeat(43);
  const endpoint = {
    id: "endpoint-1",
    workspaceId: "workspace-1",
    workflowId: "workflow-1",
    tokenHash: createHash("sha256").update(token).digest("hex"),
    enabled: true,
    secretCiphertext: "ciphertext",
    secretIv: "iv",
    secretTag: "tag",
    payloadSchema: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue(query([endpoint]));
  });

  it("rejects a reused external id when the payload changed", async () => {
    const body = JSON.stringify({ id: "provider-event-1", status: "changed" });
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const tx = {
      insert: vi.fn(() => query([])),
      select: vi.fn(() => query([{ eventId: "event-original", payloadHash: "different-hash" }])),
    };
    mocks.transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));

    const result = await receiveWorkflowWebhook({
      endpointId: endpoint.id,
      token,
      rawBody: body,
      signature: signature(timestamp, body, "provider-event-1"),
      timestamp,
      externalEventId: "provider-event-1",
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: "This external event id was already accepted with a different payload.",
    });
  });

  it("blocks direct webhook receipt in public demo before reading or persisting", async () => {
    vi.stubEnv("DEMO_MODE", "true");

    await expect(
      receiveWorkflowWebhook({
        endpointId: endpoint.id,
        token,
        rawBody: JSON.stringify({ id: "demo-event" }),
        signature: null,
        timestamp: null,
        externalEventId: "demo-event",
      }),
    ).rejects.toMatchObject({ code: "DEMO_ACTION_DISABLED" });

    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("rejects oversized external ids instead of truncating their identity", async () => {
    const body = JSON.stringify({ ok: true });
    const timestamp = String(Math.floor(Date.now() / 1_000));

    const result = await receiveWorkflowWebhook({
      endpointId: endpoint.id,
      token,
      rawBody: body,
      signature: signature(timestamp, body),
      timestamp,
      externalEventId: "x".repeat(201),
    });

    expect(result).toEqual({
      ok: false,
      status: 422,
      error: "External event id must be 200 characters or fewer.",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects payloads that do not match the endpoint schema before creating a receipt", async () => {
    mocks.select.mockReturnValue(query([{
      ...endpoint,
      payloadSchema: {
        type: "object",
        required: ["candidateId"],
        properties: { candidateId: { type: "string" } },
        additionalProperties: false,
      },
    }]));
    const body = JSON.stringify({ candidateId: 42, unrecognized: true });
    const timestamp = String(Math.floor(Date.now() / 1_000));

    const result = await receiveWorkflowWebhook({
      endpointId: endpoint.id,
      token,
      rawBody: body,
      signature: signature(timestamp, body, "provider-event-2"),
      timestamp,
      externalEventId: "provider-event-2",
    });

    expect(result).toMatchObject({ ok: false, status: 422 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("records one receipt and one durable outbox event for a matching payload", async () => {
    const body = JSON.stringify({ id: "candidate-created-17", candidateId: "candidate-17" });
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const insertResults = [[{
      eventId: "event-accepted-1",
      payloadHash: createHash("sha256").update(body).digest("hex"),
    }], []];
    const tx = {
      insert: vi.fn(() => query(insertResults.shift() ?? [])),
      update: vi.fn(() => query([])),
    };
    mocks.transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));

    const result = await receiveWorkflowWebhook({
      endpointId: endpoint.id,
      token,
      rawBody: body,
      signature: signature(timestamp, body),
      timestamp,
      externalEventId: null,
    });

    expect(result).toMatchObject({
      ok: true,
      duplicate: false,
      workspaceId: endpoint.workspaceId,
      workflowId: endpoint.workflowId,
      payload: {
        externalEventId: "candidate-created-17",
        payload: { id: "candidate-created-17", candidateId: "candidate-17" },
      },
    });
    expect(tx.insert).toHaveBeenCalledTimes(2);
    expect(tx.update).toHaveBeenCalledOnce();
  });

  it("binds the idempotency header into the HMAC signature", async () => {
    const body = JSON.stringify({ ok: true });
    const timestamp = String(Math.floor(Date.now() / 1_000));

    const result = await receiveWorkflowWebhook({
      endpointId: endpoint.id,
      token,
      rawBody: body,
      signature: signature(timestamp, body, "signed-event-id"),
      timestamp,
      externalEventId: "different-event-id",
    });

    expect(result).toMatchObject({ ok: false, status: 401, error: "Webhook signature is invalid." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("authenticates the raw body before parsing its JSON", async () => {
    const body = "not-json";
    const timestamp = String(Math.floor(Date.now() / 1_000));

    const unauthenticated = await receiveWorkflowWebhook({
      endpointId: endpoint.id,
      token,
      rawBody: body,
      signature: "sha256=" + "0".repeat(64),
      timestamp,
      externalEventId: null,
    });
    const authenticated = await receiveWorkflowWebhook({
      endpointId: endpoint.id,
      token,
      rawBody: body,
      signature: signature(timestamp, body),
      timestamp,
      externalEventId: null,
    });

    expect(unauthenticated).toMatchObject({ ok: false, status: 401 });
    expect(authenticated).toMatchObject({ ok: false, status: 422, error: "Webhook payload must be valid JSON." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("workflow webhook endpoint schema configuration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects invalid schemas before creating or updating an endpoint", async () => {
    await expect(createWorkflowWebhookEndpoint({
      workspaceId: "workspace-1",
      workflowId: "workflow-1",
      actorId: "user-1",
      name: "Partner events",
      payloadSchema: { type: "object", properties: { value: { type: "unsupported" } } },
    })).rejects.toThrow(/Invalid payload schema/);

    await expect(setWorkflowWebhookEndpointPayloadSchema({
      workspaceId: "workspace-1",
      endpointId: "endpoint-1",
      payloadSchema: { type: "object", properties: { value: { type: "unsupported" } } },
    })).rejects.toThrow(/Invalid payload schema/);

    expect(mocks.select).not.toHaveBeenCalled();
  });
});
