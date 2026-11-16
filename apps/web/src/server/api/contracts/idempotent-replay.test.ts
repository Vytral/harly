import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), reserve: vi.fn() }));

vi.mock("@/server/api/auth", () => ({
  authenticateApiKey: mocks.authenticate,
  hasApiScope: () => true,
}));
vi.mock("@/server/api/idempotency", () => ({
  reserveIdempotencyKey: mocks.reserve,
  releaseIdempotencyReservation: vi.fn(async () => undefined),
}));

import { buildRouteHandler, defineContract } from "./core";

describe("buildRouteHandler idempotent replay", () => {
  it("marks a replayed response with Idempotent-Replayed and skips the handler", async () => {
    mocks.authenticate.mockResolvedValue({ workspaceId: "ws-1", type: "secret", scopes: ["jobs:write"] });
    mocks.reserve.mockResolvedValue({
      kind: "replay",
      response: { status: 201, body: { data: { id: "x" } } },
    });
    const contract = defineContract({
      method: "POST",
      path: "/api/v1/test-replay",
      operationId: "testReplay",
      summary: "test",
      auth: { scopes: ["jobs:write"] },
      idempotent: true,
      requestBody: z.object({}),
      responses: { 201: z.object({}) },
    });
    const handler = vi.fn(async () => Response.json({}));
    const response = await buildRouteHandler(contract, handler)(
      new Request("https://example.test/api/v1/test-replay", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": "k1" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("Idempotent-Replayed")).toBe("true");
    expect(handler).not.toHaveBeenCalled();
  });
});
