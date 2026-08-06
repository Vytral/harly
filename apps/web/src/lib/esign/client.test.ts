import { beforeEach, describe, expect, it, vi } from "vitest";

const safeFetchHttp = vi.hoisted(() => vi.fn());

vi.mock("@/lib/esign/config", () => ({
  getWorkspaceEsignConfig: vi.fn(),
}));
vi.mock("@/lib/ssrf", () => ({ safeFetchHttp }));

import { downloadDocusealFile } from "./client";

const ctx = {
  baseUrl: "https://sign.example.test",
  apiUrl: "https://sign.example.test/api",
  apiToken: "workspace-secret",
  webhookSecret: null,
  offerSignatureChannel: "esign" as const,
};

describe("downloadDocusealFile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    safeFetchHttp.mockReset();
  });

  it("does not fetch or disclose the token for an untrusted artifact URL", async () => {
    await expect(
      downloadDocusealFile(ctx, "https://attacker.example/file.pdf"),
    ).rejects.toThrow(/untrusted artifact/i);
    expect(safeFetchHttp).not.toHaveBeenCalled();
  });

  it("rejects redirects while the bearer header is present", async () => {
    safeFetchHttp.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://attacker.example/file.pdf" },
      }),
    );

    await expect(
      downloadDocusealFile(ctx, "/file.pdf"),
    ).rejects.toThrow(/redirected/i);
    expect(safeFetchHttp).toHaveBeenCalledWith(
      "https://sign.example.test/file.pdf",
      expect.objectContaining({
        redirect: "manual",
        headers: { "X-Auth-Token": "workspace-secret" },
      }),
    );
  });
});
