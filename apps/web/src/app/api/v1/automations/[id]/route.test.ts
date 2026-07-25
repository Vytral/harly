import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@harly/api";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  getWorkflow: vi.fn(),
  updateWorkflow: vi.fn(),
  deleteWorkflow: vi.fn(),
}));

vi.mock("@/features/automations/data", () => ({
  getWorkflow: mocks.getWorkflow,
  updateWorkflow: mocks.updateWorkflow,
  deleteWorkflow: mocks.deleteWorkflow,
  serializeWorkflow: vi.fn((w: unknown) => w),
}));
vi.mock("@/server/api/auth", () => ({
  authenticateApiKey: mocks.authenticate,
  getRequestRateLimit: vi.fn(() => null),
}));

import { DELETE, GET, PATCH } from "./route";

const WORKFLOW_ID = "11111111-1111-4111-8111-111111111111";
const ctx = { workspaceId: "ws-1", keyId: "k", createdById: "user-1" };

function buildRequest(method: string, body?: unknown) {
  return new Request(`https://harly.dev/api/v1/automations/${WORKFLOW_ID}`, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const routeCtx = () => ({ params: Promise.resolve({ id: WORKFLOW_ID }) });

describe("GET /api/v1/automations/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the workflow scoped to the workspace", async () => {
    mocks.authenticate.mockResolvedValue(ctx);
    mocks.getWorkflow.mockResolvedValue({ id: WORKFLOW_ID, name: "X" });

    const response = await GET(buildRequest("GET"), routeCtx());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.getWorkflow).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: WORKFLOW_ID,
    });
    expect(body.data).toMatchObject({ id: WORKFLOW_ID });
  });

  it("surfaces not_found when the workflow is missing", async () => {
    mocks.authenticate.mockResolvedValue(ctx);
    mocks.getWorkflow.mockRejectedValue(
      ApiError.notFound("Workflow not found."),
    );

    const response = await GET(buildRequest("GET"), routeCtx());
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/v1/automations/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates and returns the workflow", async () => {
    mocks.authenticate.mockResolvedValue(ctx);
    mocks.updateWorkflow.mockResolvedValue({ id: WORKFLOW_ID, enabled: false });

    const response = await PATCH(
      buildRequest("PATCH", { enabled: false }),
      routeCtx(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.updateWorkflow).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: WORKFLOW_ID,
      patch: expect.objectContaining({ enabled: false }),
    });
    expect(body.data).toMatchObject({ enabled: false });
  });

  it("rejects an invalid patch (422)", async () => {
    mocks.authenticate.mockResolvedValue(ctx);

    const response = await PATCH(
      buildRequest("PATCH", { trigger: { event: "not-a-real-event" } }),
      routeCtx(),
    );
    expect(response.status).toBe(422);
    expect(mocks.updateWorkflow).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/automations/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes and returns { deleted: true }", async () => {
    mocks.authenticate.mockResolvedValue(ctx);
    mocks.deleteWorkflow.mockResolvedValue(undefined);

    const response = await DELETE(buildRequest("DELETE"), routeCtx());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.deleteWorkflow).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: WORKFLOW_ID,
    });
    expect(body.data).toEqual({ deleted: true });
  });
});
