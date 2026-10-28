import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getZoomToken: vi.fn(),
  fetch: vi.fn(),
  refreshZoomAccessToken: vi.fn(),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("./config", () => ({
  getZoomToken: mocks.getZoomToken,
}));

vi.mock("./oauth", () => ({
  refreshZoomAccessToken: mocks.refreshZoomAccessToken,
}));

vi.mock("@/features/integrations/health/repository", () => ({
  recordIntegrationSuccess: mocks.recordSuccess,
  recordIntegrationFailure: mocks.recordFailure,
}));

vi.stubGlobal("fetch", mocks.fetch);

import { ZoomAPIError, zoomFetch } from "./client";

function response(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function authorizationOf(call: number): string {
  const [, init] = mocks.fetch.mock.calls[call] as [string, RequestInit];
  return new Headers(init.headers).get("Authorization") ?? "";
}

describe("zoomFetch token refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getZoomToken.mockResolvedValue("access-1");
  });

  it("refreshes once on 401 and retries with the rotated access token", async () => {
    mocks.fetch
      .mockResolvedValueOnce(response(401, { message: "Invalid access token" }))
      .mockResolvedValueOnce(response(200, { id: 1 }));
    mocks.refreshZoomAccessToken.mockResolvedValue({ ok: true, accessToken: "access-2" });

    const result = await zoomFetch<{ id: number }>("workspace-1", "/v2/users/me");

    expect(result).toEqual({ id: 1 });
    expect(mocks.refreshZoomAccessToken).toHaveBeenCalledTimes(1);
    expect(authorizationOf(0)).toBe("Bearer access-1");
    expect(authorizationOf(1)).toBe("Bearer access-2");
    expect(mocks.recordSuccess).toHaveBeenCalledWith("workspace-1", "zoom");
  });

  it("throws without a second failure record when the refresh itself failed", async () => {
    mocks.fetch.mockResolvedValueOnce(response(401, { message: "Invalid access token" }));
    mocks.refreshZoomAccessToken.mockResolvedValue({
      ok: false,
      reason: "auth",
      error: "Zoom authorization expired. Reconnect Zoom.",
    });

    await expect(zoomFetch("workspace-1", "/v2/users/me")).rejects.toMatchObject({
      name: "ZoomAPIError",
      status: 401,
      message: "Zoom authorization expired. Reconnect Zoom.",
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.recordFailure).not.toHaveBeenCalled();
  });

  it("records a transient server failure from a normal API call", async () => {
    mocks.fetch.mockResolvedValueOnce(
      response(503, { message: "Service unavailable", error_code: 503 }),
    );

    await expect(zoomFetch("workspace-1", "/v2/users/me")).rejects.toBeInstanceOf(ZoomAPIError);
    expect(mocks.refreshZoomAccessToken).not.toHaveBeenCalled();
    expect(mocks.recordFailure).toHaveBeenCalledWith(
      "workspace-1",
      "zoom",
      expect.any(ZoomAPIError),
    );
  });

  it("does not call Zoom or refresh when the workspace has no token", async () => {
    mocks.getZoomToken.mockResolvedValue(null);

    await expect(zoomFetch("workspace-1", "/v2/users/me")).rejects.toMatchObject({
      status: 401,
      message: "Zoom is not installed.",
    });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.refreshZoomAccessToken).not.toHaveBeenCalled();
  });
});
