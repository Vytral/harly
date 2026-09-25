import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ACTION_CATALOG } from "./builder/catalog";
import { ACTION_TYPES } from "./schema";
import { createRegistryActionAdapter } from "./runtime/worker";
import { defaultSimulationFixture } from "./runtime/simulation-fixtures";

const { createNotification } = vi.hoisted(() => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

const { safeFetchWebhook } = vi.hoisted(() => ({
  safeFetchWebhook: vi.fn(),
}));

const { enqueueEmailOutbox } = vi.hoisted(() => ({
  enqueueEmailOutbox: vi.fn().mockResolvedValue("outbox-1"),
}));

const { getWorkspaceCalStatus } = vi.hoisted(() => ({
  getWorkspaceCalStatus: vi.fn().mockResolvedValue({
    enabled: true,
    baseUrl: "https://api.cal.com/v2",
    bookingUrl: "https://cal.com/harly/interview",
    defaultEventTypeId: null,
    hasApiKey: false,
    hasWebhookSecret: false,
    encryptionReady: true,
  }),
}));

const { queueCandidateErasureForWorkflow } = vi.hoisted(() => ({
  queueCandidateErasureForWorkflow: vi.fn().mockResolvedValue({
    id: "deletion-job-1",
    status: "pending",
  }),
}));

vi.mock("@/server/notify/inbox", () => ({ createNotification }));
vi.mock("@/lib/ssrf", () => ({ safeFetchWebhook }));
vi.mock("@/lib/email/outbox-processor", () => ({ enqueueEmailOutbox }));
vi.mock("@/lib/cal/config", () => ({ getWorkspaceCalStatus }));
vi.mock("@/features/candidates/deletion-jobs", () => ({ queueCandidateErasureForWorkflow }));

let ACTION_REGISTRY: typeof import("./registry").ACTION_REGISTRY;
let getAutomationTool: typeof import("./registry").getAutomationTool;
let listAutomationToolManifests: typeof import("./registry").listAutomationToolManifests;
let resolveAutomationTarget: typeof import("./registry").resolveAutomationTarget;

beforeAll(async () => {
  process.env.HARLY_URL ??= "http://localhost:3000";
  ({ ACTION_REGISTRY, getAutomationTool, listAutomationToolManifests, resolveAutomationTarget } = await import("./registry"));
}, 30_000);

function memberDatabase(rows: Array<{ userId: string }>) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(rows),
        })),
      })),
    })),
  } as never;
}

function queuedDatabase(rows: unknown[][]) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockImplementation(async () => rows.shift() ?? []),
        })),
      })),
    })),
  } as never;
}

describe("automation action registry", () => {
  beforeEach(() => {
    createNotification.mockClear();
    safeFetchWebhook.mockReset();
    enqueueEmailOutbox.mockClear();
    getWorkspaceCalStatus.mockClear();
  });

  it("keeps every selectable catalog action backed by a runtime handler", () => {
    const registered = new Set(Object.keys(ACTION_REGISTRY));
    for (const action of ACTION_CATALOG.filter((item) => item.available)) {
      expect(registered.has(action.type), `${action.type} is selectable but has no handler`).toBe(true);
    }
    for (const type of ACTION_TYPES) {
      expect(ACTION_CATALOG.some((item) => item.type === type), `${type} is missing from the catalog`).toBe(true);
    }
  });

  it("resolves graph tools by immutable type and version", () => {
    expect(getAutomationTool("move_stage", 1)).toMatchObject({
      type: "move_stage",
      version: 1,
      targetFields: ["applicationId"],
      targetPolicy: "trigger_or_override",
    });
    expect(getAutomationTool("move_stage", 999)).toBeUndefined();
  });

  it("derives an offer target once and clears stale trigger identity", async () => {
    const resolved = await resolveAutomationTarget({
      workspaceId: "workspace-1",
      database: queuedDatabase([
        [{ applicationId: "app-offer", candidateId: "candidate-offer", jobId: "job-offer" }],
        [{ candidateId: "candidate-offer", jobId: "job-offer" }],
      ]),
      payload: {
        application: { id: "stale-app", candidateId: "stale-candidate", jobId: "stale-job" },
      },
      actionInput: { offerId: "offer-1" },
      targetFields: ["offerId"],
    });
    expect(resolved).toEqual({
      ok: true,
      target: {
        offerId: "offer-1",
        interviewId: null,
        applicationId: "app-offer",
        candidateId: "candidate-offer",
        jobId: "job-offer",
      },
    });
  });

  it("exposes only safe tool metadata to UI and AI consumers", () => {
    const manifest = listAutomationToolManifests().find(
      (tool) => tool.type === "create_offer",
    );
    expect(manifest).toMatchObject({
      version: 1,
      outputFields: expect.arrayContaining(["offerId"]),
      targetPolicy: "trigger_or_override",
    });
    expect(manifest).not.toHaveProperty("schema");
    expect(manifest).not.toHaveProperty("outputSchema");
    expect(manifest).not.toHaveProperty("run");
  });

  it("validates the typed default fixture for every immutable tool version", () => {
    for (const { type: actionType, version } of listAutomationToolManifests()) {
      const tool = getAutomationTool(actionType, version);
      expect(tool, `${actionType} must have a versioned contract`).toBeDefined();
      const fixture = defaultSimulationFixture({
        id: "action",
        type: "action",
        actionType,
        toolVersion: version,
        failurePolicy: "stop",
        input: {},
      });
      expect(fixture.status, `${actionType} fixture must succeed by default`).toBe("succeeded");
      if (fixture.status === "succeeded") {
        expect(fixture.output).toMatchObject({ toolVersion: version });
        expect(
          tool!.outputSchema.safeParse(fixture.output).success,
          `${actionType} fixture must satisfy its output contract`,
        ).toBe(true);
      }
    }
  });

  it("keeps every visible config field aligned with its runtime action schema", () => {
    for (const action of ACTION_CATALOG.filter((item) => item.available)) {
      const handler = ACTION_REGISTRY[action.type];
      expect(handler, `${action.type} must have a runtime schema`).toBeDefined();
      const shape = (handler!.schema as unknown as { shape: Record<string, unknown> }).shape;
      for (const field of action.config) {
        expect(
          Object.hasOwn(shape, field.key),
          `${action.type}.${field.key} is visible in the builder but not accepted by its runtime schema`,
        ).toBe(true);
      }
    }
  });

  it("validates explicit meeting-provider choices for scheduled interviews", () => {
    const schema = ACTION_REGISTRY.schedule_interview!.schema;
    const base = { applicationId: "app-1", candidateId: "candidate-1", scheduledAt: "2099-01-01T15:00:00.000Z" };
    expect(schema.safeParse({ ...base, meetingProvider: "zoom" }).success).toBe(true);
    expect(schema.safeParse({ ...base, meetingProvider: "external", mode: "video" }).success).toBe(false);
    expect(schema.safeParse({ ...base, meetingProvider: "zoom", mode: "phone" }).success).toBe(false);
  });

  it("queues candidate erasure through the durable deletion boundary", async () => {
    const handler = ACTION_REGISTRY.erase_candidate_data;
    expect(handler).toBeDefined();

    const result = await handler!.run(
      {},
      {
        workspaceId: "workspace-1",
        actorUserId: "actor-1",
        triggerEvent: "application.rejected",
        triggerPayload: { candidate: { id: "candidate-1" } },
        effectKey: "workflow:run-erase:node:erase",
        runId: "run-erase",
        database: memberDatabase([]),
      },
    );

    expect(result).toMatchObject({
      success: true,
      data: {
        candidateId: "candidate-1",
        deletionJobId: "deletion-job-1",
        queued: true,
        status: "pending",
      },
    });
    expect(queueCandidateErasureForWorkflow).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      candidateId: "candidate-1",
      requestedBy: "actor-1",
      database: expect.anything(),
    });
  });

  it("creates a deduplicated internal alert for a workspace member", async () => {
    const handler = ACTION_REGISTRY.send_in_app_alert;
    expect(handler).toBeDefined();

    const result = await handler!.run(
      {
        recipientUserId: "member-1",
        title: "Review candidate",
        body: "The candidate is ready for a decision.",
        href: "/dashboard/candidates/candidate-1",
      },
      {
        database: memberDatabase([{ userId: "member-1" }]),
        workspaceId: "workspace-1",
        actorUserId: "actor-1",
        triggerEvent: "application.created",
        triggerPayload: {},
        effectKey: "workflow:run-1:node:alert",
        runId: "run-1",
      },
    );

    expect(result).toMatchObject({ success: true, data: { recipientUserId: "member-1", notified: true } });
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: "workspace-1",
      recipientIds: ["member-1"],
      type: "workflow.alert",
      dedupeKey: "workflow:run-1:node:alert",
    }));
  });

  it("rejects an alert recipient outside the workspace", async () => {
    const result = await ACTION_REGISTRY.send_in_app_alert!.run(
      { recipientUserId: "foreign-user", title: "Do not send" },
      {
        database: memberDatabase([]),
        workspaceId: "workspace-1",
        actorUserId: "actor-1",
        triggerEvent: "application.created",
        triggerPayload: {},
        effectKey: "workflow:run-2:node:alert",
        runId: "run-2",
      },
    );

    expect(result).toMatchObject({ success: false, errorCode: "ALERT_RECIPIENT_NOT_FOUND" });
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("reads Cal.com settings through the worker database seam", async () => {
    const database = memberDatabase([]);
    const result = await ACTION_REGISTRY.send_booking_link!.run(
      { toEmail: "candidate@example.com" },
      {
        database,
        workspaceId: "workspace-1",
        actorUserId: "actor-1",
        triggerEvent: "application.created",
        triggerPayload: {},
        effectKey: "workflow:run-3:node:booking",
        runId: "run-3",
      },
    );

    expect(result).toMatchObject({ success: true, data: { outboxId: "outbox-1" } });
    expect(getWorkspaceCalStatus).toHaveBeenCalledWith("workspace-1", database);
    expect(enqueueEmailOutbox).toHaveBeenCalledWith(
      "workspace-1",
      "automation.email",
      expect.objectContaining({ to: "candidate@example.com" }),
      "workflow:run-3:node:booking",
      "actor-1",
      database,
    );
  });

  it("accepts the builder's line-based HTTP headers and rejects malformed entries", () => {
    const schema = ACTION_REGISTRY.http_request?.schema;
    expect(schema).toBeDefined();
    expect(schema!.safeParse({
      url: "https://example.com/hook",
      method: "POST",
      headers: "Authorization: Bearer {{secrets.TOKEN}}\nX-Workflow: {{candidate_full_name}}",
      body: "{\"event\":\"candidate.created\"}",
      secretRefs: ["TOKEN"],
    }).success).toBe(true);
    expect(schema!.safeParse({
      url: "https://example.com/hook",
      headers: "Authorization",
    }).success).toBe(false);
  });

  it("does not send unresolved secret placeholders when secretRefs is omitted", async () => {
    const result = await ACTION_REGISTRY.http_request!.run(
      { url: "https://example.com/hook", method: "POST", body: '{"token":"{{secrets.TOKEN}}"}' },
      {
        database: memberDatabase([]),
        workspaceId: "workspace-1",
        actorUserId: "actor-1",
        triggerEvent: "application.created",
        triggerPayload: {},
        effectKey: "workflow:http-missing-secret",
        runId: "run-http-missing-secret",
        signal: new AbortController().signal,
      },
    );

    expect(result).toMatchObject({ success: false });
    expect(result.error).toContain("Missing workspace secrets: TOKEN");
    expect(safeFetchWebhook).not.toHaveBeenCalled();
  });

  it("rejects malformed secret placeholders before provider I/O", async () => {
    const result = await ACTION_REGISTRY.http_request!.run(
      { url: "https://example.com/hook", body: "{{secrets.BAD NAME}}" },
      {
        database: memberDatabase([]),
        workspaceId: "workspace-1",
        actorUserId: "actor-1",
        triggerEvent: "application.created",
        triggerPayload: {},
        effectKey: "workflow:http-invalid-secret",
        runId: "run-http-invalid-secret",
        signal: new AbortController().signal,
      },
    );

    expect(result).toMatchObject({ success: false, errorCode: "INVALID_SECRET_PLACEHOLDER" });
    expect(safeFetchWebhook).not.toHaveBeenCalled();
  });

  it("normalizes authorization database outages into a retryable adapter result", async () => {
    const adapter = createRegistryActionAdapter({
      select: vi.fn(() => {
        throw new Error("database unavailable");
      }),
    } as never);

    const result = await adapter.execute({
      workspaceId: "workspace-1",
      runId: "run-3",
      workflowId: "workflow-1",
      actorUserId: "actor-1",
      triggerEvent: "application.created",
      triggerPayload: {},
      node: {
        id: "alert",
        type: "action",
        actionType: "send_in_app_alert",
        toolVersion: 1,
        failurePolicy: "stop",
        input: {},
      },
      input: { title: "Retry me" },
      effectKey: "workflow:run-3:node:alert",
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({ status: "failed", code: "ACTION_THROW", retryable: true });
  });

  it("returns safe field diagnostics when resolved action input is invalid", async () => {
    const adapter = createRegistryActionAdapter(memberDatabase([]));
    const result = await adapter.execute({
      workspaceId: "workspace-1",
      runId: "run-invalid-input",
      workflowId: "workflow-1",
      actorUserId: "actor-1",
      triggerEvent: "application.created",
      triggerPayload: {},
      node: {
        id: "http",
        type: "action",
        actionType: "http_request",
        toolVersion: 1,
        failurePolicy: "stop",
        input: {},
      },
      input: { url: 42 },
      effectKey: "workflow:invalid-input",
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      status: "failed",
      code: "INVALID_ACTION_INPUT",
      details: {
        fieldPath: "url",
        category: "validation",
        retryAdvice: "fix_configuration",
      },
    });
  });

  it.each([
    ["provider 5xx", 504, { uncertain: true, retryable: false, errorCode: "provider_5xx" }],
    ["rate limiting", 429, { uncertain: false, retryable: true, errorCode: "rate_limited" }],
  ])("classifies %s without losing the provider response", async (_label, status, expected) => {
    safeFetchWebhook.mockResolvedValue(new Response("provider response", { status }));

    const result = await ACTION_REGISTRY.http_request!.run(
      { url: "https://example.com/hook", method: "POST", body: "{}" },
      {
        database: memberDatabase([]),
        workspaceId: "workspace-1",
        actorUserId: "actor-1",
        triggerEvent: "application.created",
        triggerPayload: {},
        effectKey: `workflow:http-${status}`,
        runId: "run-http",
        signal: new AbortController().signal,
      },
    );

    expect(result).toMatchObject({ success: false, ...expected, data: { status, body: "provider response" } });
  });

  it("limits outbound HTTP response reads before creating a preview", async () => {
    safeFetchWebhook.mockResolvedValue(
      new Response("x".repeat(64 * 1024 + 1), { status: 200 }),
    );

    const result = await ACTION_REGISTRY.http_request!.run(
      { url: "https://example.com/large", method: "GET" },
      {
        database: memberDatabase([]),
        workspaceId: "workspace-1",
        actorUserId: "actor-1",
        triggerEvent: "application.created",
        triggerPayload: {},
        effectKey: "workflow:http-large",
        runId: "run-http-large",
      },
    );

    expect(result).toMatchObject({
      success: false,
      errorCode: "RESPONSE_TOO_LARGE",
      data: { status: 200 },
    });
  });

  it("marks network and timeout failures as uncertain for reconciliation", async () => {
    safeFetchWebhook.mockRejectedValue(new Error("The operation was aborted"));

    const result = await ACTION_REGISTRY.http_request!.run(
      { url: "https://example.com/hook", method: "POST" },
      {
        database: memberDatabase([]),
        workspaceId: "workspace-1",
        actorUserId: "actor-1",
        triggerEvent: "application.created",
        triggerPayload: {},
        effectKey: "workflow:http-timeout",
        runId: "run-http-timeout",
        signal: new AbortController().signal,
      },
    );

    expect(result).toMatchObject({
      success: false,
      errorCode: "network_error",
      uncertain: true,
    });
  });
});
