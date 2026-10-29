import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recordFailure: vi.fn(),
  recordSuccess: vi.fn(),
  isDemoMode: vi.fn(() => false),
}));

vi.mock("@harly/config", () => ({
  isDemoMode: mocks.isDemoMode,
}));
vi.mock("@/features/integrations/health/repository", () => ({
  recordIntegrationFailure: mocks.recordFailure,
  recordIntegrationSuccess: mocks.recordSuccess,
}));

import { classifyIntegrationError } from "@/features/integrations/health/model";

import { sendTelegramMessage } from "./client";

const BOT_TOKEN = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw";

function botResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function failedSend(status: number, description: string): Promise<unknown> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => botResponse(status, { ok: false, error_code: status, description })),
  );
  const error = await sendTelegramMessage({
    botToken: BOT_TOKEN,
    chatId: "-100123",
    text: "hello",
    workspaceId: "workspace-1",
  }).catch((e: unknown) => e);
  // The health write receives the same error object the caller gets.
  expect(mocks.recordFailure).toHaveBeenLastCalledWith("workspace-1", "telegram", error);
  return error;
}

describe("Telegram Bot API failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDemoMode.mockReturnValue(false);
  });

  it("carries the HTTP status, so a dead bot token is classified as auth", async () => {
    const error = await failedSend(401, "Unauthorized");
    expect(error).toMatchObject({ status: 401 });
    expect(classifyIntegrationError("telegram", error).kind).toBe("auth");
  });

  it("classifies a kicked bot (403) as auth, as the spec requires", async () => {
    const error = await failedSend(403, "Forbidden: bot was kicked from the group chat");
    expect(classifyIntegrationError("telegram", error)).toEqual({ kind: "auth", status: 403 });
  });

  it("keeps a bad chat id as a validation failure, not auth", async () => {
    const error = await failedSend(400, "Bad Request: chat not found");
    expect(classifyIntegrationError("telegram", error).kind).toBe("other");
  });

  it("never puts the bot token into the error text", async () => {
    const error = (await failedSend(401, "Unauthorized")) as Error;
    expect(error.message).not.toContain(BOT_TOKEN);
    expect(error.message).not.toContain("AAHdqT");
  });

  it("records success only after Telegram accepts the message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => botResponse(200, { ok: true, result: {} })));
    await sendTelegramMessage({ botToken: BOT_TOKEN, chatId: "-100123", text: "hi", workspaceId: "workspace-1" });
    expect(mocks.recordSuccess).toHaveBeenCalledWith("workspace-1", "telegram", { startedAt: expect.any(Date) });
    expect(mocks.recordFailure).not.toHaveBeenCalled();
  });
});
