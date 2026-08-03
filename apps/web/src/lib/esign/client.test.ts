import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/esign/config", () => ({
  getWorkspaceEsignConfig: vi.fn(),
}));

import { downloadDocusealFile } from "./client";

const ctx = {
  baseUrl: "https://sign.example.test",
  apiUrl: "https://sign.example.test/api",
  apiToken: "workspace-secret",
  webhookSecret: null,
  offerSignatureChannel: "esign" as const,
};

describe("downloadDocusealFile", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("does not fetch or disclose the token for an untrusted artifact URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      downloadDocusealFile(ctx, "https://attacker.example/file.pdf"),
    ).rejects.toThrow(/untrusted artifact/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects redirects while the bearer header is present", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://attacker.example/file.pdf" },
      }),
    );

    await expect(
      downloadDocusealFile(ctx, "/file.pdf"),
    ).rejects.toThrow(/redirected/i);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sign.example.test/file.pdf",
      expect.objectContaining({
        redirect: "manual",
        headers: { "X-Auth-Token": "workspace-secret" },
      }),
    );
  });
});
