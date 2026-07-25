import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  listRuns: vi.fn(),
}));

vi.mock("@/features/automations/data", () => ({
  listRuns: mocks.listRuns,
  serializeRun: vi.fn((r: unknown) => r),
}));
vi.mock("@/server/api/auth", () => ({
  authenticateApiKey: mocks.authenticate,
  getRequestRateLimit: vi.fn(() => null),
}));

import { GET } from "./route";

const ctx = { workspaceId: "ws-1", keyId: "k" };
const WORKFLOW_ID = "11111111-1111-4111-8111-111111111111";
const routeCtx = () => ({ params: Promise.resolve({ id: WORKFLOW_ID }) });

function buildRequest(query = "") {
  return new Request(
    `https://harly.dev/api/v1/automations/${WORKFLOW_ID}/runs${query}`,
    {
      method: "GET",
    },
  );
}

describe("GET /api/v1/automations/:id/runs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists runs for the workflow scoped to the workspace", async () => {
    mocks.authenticate.mockResolvedValue(ctx);
    mocks.listRuns.mockResolvedValue([{ id: "run-1" }, { id: "run-2" }]);

    const response = await GET(buildRequest(), routeCtx());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.authenticate).toHaveBeenCalledWith(
      expect.any(Request),
      "automations:read",
    );
    expect(mocks.listRuns).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      workflowId: WORKFLOW_ID,
      limit: 50,
    });
    expect(body.data).toEqual([{ id: "run-1" }, { id: "run-2" }]);
  });

  it("honors a valid limit query param (1-100)", async () => {
    mocks.authenticate.mockResolvedValue(ctx);
    mocks.listRuns.mockResolvedValue([]);

    await GET(buildRequest("?limit=10"), routeCtx());

    expect(mocks.listRuns).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 }),
    );
  });

  it("falls back to 50 for an out-of-range limit", async () => {
    mocks.authenticate.mockResolvedValue(ctx);
    mocks.listRuns.mockResolvedValue([]);

    await GET(buildRequest("?limit=500"), routeCtx());

    expect(mocks.listRuns).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 }),
    );
  });
});
