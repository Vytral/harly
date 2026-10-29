import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, PUBLISHABLE_SCOPES } from "@harly/api";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
}));

vi.mock("@/server/api/auth", () => ({
  authenticateApiKey: mocks.authenticate,
  hasApiScope: (scopes: string[], scope: string) => scopes.includes(scope),
}));
vi.mock("@/server/api/idempotency", () => ({
  reserveIdempotencyKey: vi.fn(async () => ({ kind: "not_requested" })),
  releaseIdempotencyReservation: vi.fn(async () => undefined),
}));

import { buildRouteHandler, defineContract } from "./core";
import { apiContracts } from "./registry";

describe("contract key-type policy", () => {
  it("only the intended operations are reachable with a publishable key", () => {
    const reachable = apiContracts
      .filter((contract) => {
        const scopes = contract.auth?.scopes ?? [];
        const keyTypes = contract.auth?.keyTypes ?? ["publishable", "secret"];
        return (
          scopes.length > 0 &&
          scopes.every((scope) => PUBLISHABLE_SCOPES.includes(scope)) &&
          keyTypes.includes("publishable")
        );
      })
      .map((contract) => contract.operationId)
      .sort();

    // Browser-facing surface: read jobs, and create an application (the
    // public widget). Everything that changes an existing application is
    // secret-only.
    expect(reachable).toEqual(["createApplication", "getJob", "listJobs"]);
  });

  it("every state-changing application route except create is secret-only", () => {
    const stateChanging = apiContracts.filter(
      (contract) =>
        contract.path.startsWith("/api/v1/applications") &&
        contract.method !== "GET" &&
        contract.operationId !== "createApplication",
    );

    expect(stateChanging.map((contract) => contract.operationId).sort()).toEqual([
      "bulkCreateApplications",
      "hireApplication",
      "moveApplication",
      "rejectApplication",
    ]);
    for (const contract of stateChanging) {
      expect(contract.auth?.keyTypes, contract.operationId).toEqual(["secret"]);
    }
  });
});

describe("buildRouteHandler enforces keyTypes", () => {
  const contract = defineContract({
    method: "POST",
    path: "/api/v1/test-secret-only",
    operationId: "testSecretOnly",
    summary: "test",
    auth: { scopes: ["applications:write"], keyTypes: ["secret"] },
    requestBody: z.object({}),
    responses: { 200: z.object({}) },
  });

  const handler = buildRouteHandler(contract, async () =>
    Response.json({ ok: true }, { status: 200 }),
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a key whose type is not allowed, before the handler runs", async () => {
    mocks.authenticate.mockResolvedValue({
      workspaceId: "ws-1",
      keyId: "key-pk",
      createdById: null,
      type: "publishable",
      environment: "live",
      scopes: ["applications:write"],
    });
    const handlerSpy = vi.fn(async () => Response.json({ ok: true }));
    const guarded = buildRouteHandler(contract, handlerSpy);
    const rejection = guarded(
      new Request("https://example.test/api/v1/test-secret-only", {
        method: "POST",
        headers: { authorization: "Bearer harly_pk_live_x", "content-type": "application/json" },
        body: "{}",
      }),
    );
    await expect(rejection).rejects.toBeInstanceOf(ApiError);
    await expect(rejection).rejects.toThrow("requires a secret API key");
    expect(handlerSpy).not.toHaveBeenCalled();
  });

  it("runs the handler for a secret key", async () => {
    mocks.authenticate.mockResolvedValue({
      workspaceId: "ws-1",
      keyId: "key-sk",
      createdById: null,
      type: "secret",
      environment: "live",
      scopes: ["applications:write"],
    });
    const response = await handler(
      new Request("https://example.test/api/v1/test-secret-only", {
        method: "POST",
        headers: { authorization: "Bearer harly_sk_live_x", "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(200);
  });
});
