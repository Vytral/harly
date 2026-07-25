import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  reserve: vi.fn(),
  complete: vi.fn(),
  listWorkflows: vi.fn(),
  createWorkflow: vi.fn(),
}));

vi.mock("@/features/automations/data", () => ({
  listWorkflows: mocks.listWorkflows,
  createWorkflow: mocks.createWorkflow,
  serializeWorkflow: vi.fn((w: unknown) => w),
}));
vi.mock("@/server/api/auth", () => ({
  authenticateApiKey: mocks.authenticate,
  getRequestRateLimit: vi.fn(() => null),
}));
vi.mock("@/server/api/idempotency", () => ({
  reserveIdempotencyKey: mocks.reserve,
  releaseIdempotencyReservation: vi.fn(async () => undefined),
}));

import { GET, POST } from "./route";

const ctx = { workspaceId: "ws-1", keyId: "k", createdById: "user-1" };
const validBody = {
  name: "Auto-reject juniors",
  trigger: { event: "application.created" },
  actions: [{ type: "set_status", config: { status: "rejected" } }],
};

function buildRequest(body?: unknown, headers: Record<string, string> = {}) {
  return new Request("https://harly.dev/api/v1/automations", {
    method: body !== undefined ? "POST" : "GET",
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("GET /api/v1/automations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists workflows for the authenticated workspace (automations:read)", async () => {
    mocks.authenticate.mockResolvedValue(ctx);
    mocks.listWorkflows.mockResolvedValue([{ id: "wf-1" }, { id: "wf-2" }]);

    const response = await GET(buildRequest(), undefined);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.authenticate).toHaveBeenCalledWith(
      expect.any(Request),
      "automations:read",
    );
    expect(mocks.listWorkflows).toHaveBeenCalledWith("ws-1");
    expect(body.data).toEqual([{ id: "wf-1" }, { id: "wf-2" }]);
  });
});

describe("POST /api/v1/automations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a workflow and returns 201 (automations:write)", async () => {
    mocks.authenticate.mockResolvedValue(ctx);
    mocks.reserve.mockResolvedValue({ kind: "not_requested" });
    const created = { id: "wf-1", ...validBody };
    mocks.createWorkflow.mockResolvedValue(created);

    const response = await POST(buildRequest(validBody), undefined);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.authenticate).toHaveBeenCalledWith(
      expect.any(Request),
      "automations:write",
    );
    expect(mocks.createWorkflow).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      values: expect.objectContaining({ name: "Auto-reject juniors" }),
      createdById: "user-1",
    });
    expect(body.data).toMatchObject({ id: "wf-1" });
  });

  it("replays a previous idempotent response", async () => {
    mocks.authenticate.mockResolvedValue(ctx);
    mocks.reserve.mockResolvedValue({
      kind: "replay",
      key: "idem-1",
      response: { status: 201, body: { data: { id: "wf-replayed" } } },
    });

    const response = await POST(
      buildRequest(validBody, { "Idempotency-Key": "idem-1" }),
      undefined,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({ id: "wf-replayed" });
    // The create must NOT have been called again.
    expect(mocks.createWorkflow).not.toHaveBeenCalled();
  });

  it("completes the idempotency reservation after a successful create", async () => {
    mocks.authenticate.mockResolvedValue(ctx);
    mocks.reserve.mockResolvedValue({
      kind: "reserved",
      key: "idem-1",
      complete: mocks.complete,
    });
    mocks.createWorkflow.mockResolvedValue({ id: "wf-1", ...validBody });

    await POST(
      buildRequest(validBody, { "Idempotency-Key": "idem-1" }),
      undefined,
    );

    expect(mocks.complete).toHaveBeenCalled();
  });

  it("rejects an invalid body (422) without creating", async () => {
    mocks.authenticate.mockResolvedValue(ctx);
    mocks.reserve.mockResolvedValue({ kind: "not_requested" });

    const response = await POST(
      buildRequest({
        name: "",
        trigger: { event: "application.created" },
        actions: [],
      }),
      undefined,
    );

    expect(response.status).toBe(422);
    expect(mocks.createWorkflow).not.toHaveBeenCalled();
  });
});
