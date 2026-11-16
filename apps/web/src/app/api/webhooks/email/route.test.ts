import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  InboundPayloadError: class InboundPayloadError extends Error {},
  config: vi.fn(),
  process: vi.fn(),
  verify: vi.fn(),
  parse: vi.fn(),
}));

const InboundPayloadError = mocks.InboundPayloadError;

vi.mock("@harly/emails", () => ({
  InboundPayloadError: mocks.InboundPayloadError,
  postmarkAdapter: { verifySignature: (...a: unknown[]) => mocks.verify(...a), parse: (...a: unknown[]) => mocks.parse(...a) },
  resendAdapter: { verifySignature: (...a: unknown[]) => mocks.verify(...a), parse: (...a: unknown[]) => mocks.parse(...a) },
}));
vi.mock("@/lib/email/config", () => ({ getWorkspaceInboundEmailConfig: mocks.config }));
vi.mock("@/lib/email/inbound-processor", () => ({ processInboundEmail: mocks.process }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { POST } from "./[provider]/route";

function call(body: string, init: { ws?: string | null; provider?: string; headers?: Record<string, string> } = {}) {
  const ws = init.ws === undefined ? "ws-1" : init.ws;
  const url = `http://localhost/api/webhooks/email/${init.provider ?? "postmark"}${ws ? `?ws=${ws}` : ""}`;
  return POST(new NextRequest(url, { method: "POST", body, headers: init.headers }), {
    params: Promise.resolve({ provider: init.provider ?? "postmark" }),
  });
}

beforeEach(() => {
  mocks.config.mockReset().mockResolvedValue({ provider: "postmark", webhookSecret: "s" });
  mocks.process.mockReset().mockResolvedValue(undefined);
  mocks.verify.mockReset().mockReturnValue(true);
  mocks.parse.mockReset().mockResolvedValue({ messageId: "<m@example.test>" });
});

describe("inbound email webhook", () => {
  it("answers an unknown workspace exactly like a bad signature", async () => {
    mocks.config.mockResolvedValue(null);
    const unknown = await call("{}");
    mocks.config.mockResolvedValue({ provider: "postmark", webhookSecret: "s" });
    mocks.verify.mockReturnValue(false);
    const badSignature = await call("{}");

    expect(unknown.status).toBe(401);
    expect(badSignature.status).toBe(401);
    expect(await unknown.json()).toEqual(await badSignature.json());
  });

  it("rejects an oversized body from its declared length without reading it", async () => {
    const res = await call("{}", { headers: { "content-length": String(100 * 1024 * 1024) } });
    expect(res.status).toBe(413);
    expect(mocks.config).not.toHaveBeenCalled();
  });

  it("returns 400 for an unusable payload and 5xx for transient failures", async () => {
    mocks.parse.mockRejectedValueOnce(new InboundPayloadError("bad"));
    expect((await call("{}")).status).toBe(400);

    mocks.parse.mockRejectedValueOnce(new Error("resend api down"));
    expect((await call("{}")).status).toBe(502);

    mocks.process.mockRejectedValueOnce(new Error("connection terminated"));
    expect((await call("{}")).status).toBe(500);

    mocks.config.mockRejectedValueOnce(new Error("db down"));
    expect((await call("{}")).status).toBe(503);
  });

  it("accepts a verified email", async () => {
    const res = await call("{}");
    expect(res.status).toBe(200);
    expect(mocks.process).toHaveBeenCalledTimes(1);
  });
});
