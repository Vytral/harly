import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  demo: false,
  send: vi.fn(),
  sender: null as { send: (...args: unknown[]) => unknown } | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@harly/config", () => ({ isDemoMode: () => mocks.demo }));
vi.mock("@harly/emails", () => ({
  createEmailSender: () => mocks.sender,
  DeliveryOutcomeUnknownError: class DeliveryOutcomeUnknownError extends Error {},
}));
vi.mock("./config", () => ({ getWorkspaceEmailConfig: async () => ({}) }));
vi.mock("./sender-identity", () => ({ resolveSenderFromOverride: async (_w: string, _a: unknown, config: unknown) => config }));
vi.mock("@/lib/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { sendWorkspaceEmail } from "./index";

const OPTIONS = { to: "candidate@example.test", subject: "Hi", react: null as never };

beforeEach(() => {
  mocks.demo = false;
  mocks.send.mockReset();
  mocks.sender = { send: mocks.send };
});

describe("sendWorkspaceEmail failure reporting", () => {
  it("reports a missing sender", async () => {
    mocks.sender = null;
    const onFailure = vi.fn();
    await expect(sendWorkspaceEmail("ws-1", OPTIONS, null, { onFailure })).resolves.toBe(false);
    expect(onFailure).toHaveBeenCalledWith({
      reason: "no_sender",
      detail: "No configured workspace email sender.",
    });
  });

  it("reports the real provider error, sanitized", async () => {
    mocks.send.mockRejectedValue(new Error("Domain not verified for candidate@example.test"));
    const onFailure = vi.fn();
    await expect(sendWorkspaceEmail("ws-1", OPTIONS, null, { onFailure })).resolves.toBe(false);
    expect(onFailure).toHaveBeenCalledWith({
      reason: "provider_error",
      detail: "Provider error: Domain not verified for [email]",
    });
  });

  it("reports demo mode", async () => {
    mocks.demo = true;
    const onFailure = vi.fn();
    await expect(sendWorkspaceEmail("ws-1", OPTIONS, null, { onFailure })).resolves.toBe(false);
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({ reason: "demo_mode" }));
  });
});
