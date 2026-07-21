import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceContextOrNull: vi.fn(),
  requirePermission: vi.fn(),
  getWorkspaceAiConfig: vi.fn(),
  getModel: vi.fn(),
  buildHarlyTools: vi.fn(),
  buildHarlySystemPrompt: vi.fn(),
  validateUIMessages: vi.fn(),
  convertToModelMessages: vi.fn(),
  streamText: vi.fn(),
  enforceRateLimit: vi.fn(),
  recordAiUsage: vi.fn(),
  persistConversation: vi.fn(),
}));

vi.mock("ai", () => ({
  validateUIMessages: mocks.validateUIMessages,
  convertToModelMessages: mocks.convertToModelMessages,
  stepCountIs: vi.fn((count) => ({ count })),
  streamText: mocks.streamText,
}));
vi.mock("@/features/workspaces/context", () => ({
  getWorkspaceContextOrNull: mocks.getWorkspaceContextOrNull,
}));
vi.mock("@/features/workspaces/permissions-server", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/ai/config", () => ({ getWorkspaceAiConfig: mocks.getWorkspaceAiConfig }));
vi.mock("@/lib/ai/registry", () => ({ getModel: mocks.getModel }));
vi.mock("@/lib/ai/agent", () => ({ buildHarlyTools: mocks.buildHarlyTools }));
vi.mock("@/lib/ai/agent/system-prompt", () => ({
  buildHarlySystemPrompt: mocks.buildHarlySystemPrompt,
}));
vi.mock("@/server/api/ratelimit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/ai/usage", () => ({ recordAiUsage: mocks.recordAiUsage }));
vi.mock("@/features/ai-chat/data", () => ({ persistConversation: mocks.persistConversation }));

import { POST } from "./route";

const context = {
  organization: { id: "workspace-1", name: "Harly" },
  user: { id: "user-1", name: "Ada Lovelace" },
  role: "recruiter",
};
const config = { provider: "openai", modelId: "gpt-test" };
const message = { id: "message-1", role: "user", parts: [{ type: "text", text: "Hello" }] };

function request(body: unknown, signal?: AbortSignal) {
  return new Request("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

describe("POST /api/ai/chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspaceContextOrNull.mockResolvedValue(context);
    mocks.requirePermission.mockResolvedValue(context);
    mocks.getWorkspaceAiConfig.mockResolvedValue(config);
    mocks.getModel.mockReturnValue("model");
    mocks.buildHarlyTools.mockReturnValue({ lookup: { execute: vi.fn() } });
    mocks.buildHarlySystemPrompt.mockReturnValue("system");
    mocks.validateUIMessages.mockResolvedValue([message]);
    mocks.convertToModelMessages.mockResolvedValue([{ role: "user", content: "Hello" }]);
    mocks.enforceRateLimit.mockResolvedValue({ remaining: 1, resetAt: Date.now() + 60_000 });
    mocks.persistConversation.mockResolvedValue(undefined);
    mocks.streamText.mockReturnValue({
      totalUsage: Promise.resolve({ inputTokens: 13, outputTokens: 21 }),
      toUIMessageStreamResponse: vi.fn(() => new Response("stream")),
    });
  });

  it("rejects callers without collaboration permission before reading AI configuration", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("forbidden"));

    const response = await POST(request({ messages: [message] }));

    expect(response.status).toBe(403);
    expect(mocks.getWorkspaceAiConfig).not.toHaveBeenCalled();
  });

  it("rejects invalid and oversized chat histories before calling the model", async () => {
    mocks.validateUIMessages.mockRejectedValue(new Error("invalid message"));

    const invalid = await POST(request({ messages: [{ role: "system", parts: [] }] }));
    const oversized = await POST(
      request({ messages: Array.from({ length: 41 }, (_, index) => ({ ...message, id: `m-${index}` })) }),
    );

    expect(invalid.status).toBe(400);
    expect(oversized.status).toBe(413);
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("accepts the extra keys the AI SDK v6 client sends (id, trigger, messageId) instead of 400ing", async () => {
    const response = await POST(
      request({
        id: "chat-1",
        messages: [message],
        trigger: "submit",
        messageId: "m-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.validateUIMessages).toHaveBeenCalledWith({
      messages: [message],
      tools: { lookup: { execute: expect.any(Function) } },
    });
  });

  it("passes the active candidate context to tools and the system prompt", async () => {
    const candidateId = "6a5346f8-d3e6-4b2e-9d12-da950cc40274";
    const response = await POST(
      request({ messages: [message], candidateId }),
    );

    expect(response.status).toBe(200);
    expect(mocks.buildHarlyTools).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      userId: "user-1",
      activeCandidateId: candidateId,
      mentionedCandidateIds: [],
    });
    expect(mocks.buildHarlySystemPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ activeCandidateId: candidateId }),
    );
  });

  it("validates messages and propagates cancellation, usage, and both rate-limit scopes", async () => {
    const controller = new AbortController();
    const chatRequest = request({ messages: [message] }, controller.signal);
    const response = await POST(chatRequest);
    await Promise.resolve();

    expect(response.status).toBe(200);
    expect(mocks.validateUIMessages).toHaveBeenCalledWith({
      messages: [message],
      tools: { lookup: { execute: expect.any(Function) } },
    });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      "ai-chat:workspace:workspace-1",
      { limit: 40, windowMs: 60_000 },
    );
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      "ai-chat:user:workspace-1:user-1",
      { limit: 12, windowMs: 60_000 },
    );
    expect(mocks.streamText).toHaveBeenCalledWith(expect.objectContaining({
      abortSignal: chatRequest.signal,
      maxOutputTokens: 3_072,
      messages: [{ role: "user", content: "Hello" }],
    }));
    expect(mocks.recordAiUsage).toHaveBeenCalledWith(expect.objectContaining({
      promptTokens: 13,
      completionTokens: 21,
    }));
    expect(mocks.streamText.mock.results[0]?.value.toUIMessageStreamResponse).toHaveBeenCalledWith(
      expect.objectContaining({ consumeSseStream: expect.any(Function) }),
    );
  });
});
