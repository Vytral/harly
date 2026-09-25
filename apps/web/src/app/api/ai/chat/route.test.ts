import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkspaceContextOrNull: vi.fn(),
  getRolePolicy: vi.fn(),
  requirePermission: vi.fn(),
  getWorkspaceAiConfig: vi.fn(),
  getModel: vi.fn(),
  buildHarlyTools: vi.fn(),
  buildHarlySystemPrompt: vi.fn(),
  getWorkspaceKnowledge: vi.fn(),
  validateUIMessages: vi.fn(),
  convertToModelMessages: vi.fn(),
  streamText: vi.fn(),
  enforceRateLimit: vi.fn(),
  recordAiUsage: vi.fn(),
  persistConversation: vi.fn(),
  assertToolRoutingCoversAllTools: vi.fn(),
  resolveActiveToolGroups: vi.fn(),
  selectActiveToolNames: vi.fn(),
  shouldWidenForStep: vi.fn(),
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
  getRolePolicy: mocks.getRolePolicy,
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/lib/ai/config", () => ({ getWorkspaceAiConfig: mocks.getWorkspaceAiConfig }));
vi.mock("@/lib/ai/registry", () => ({ getModel: mocks.getModel }));
vi.mock("@/lib/ai/agent", () => ({ buildHarlyTools: mocks.buildHarlyTools }));
vi.mock("@/lib/ai/agent/system-prompt", () => ({
  buildHarlySystemPrompt: mocks.buildHarlySystemPrompt,
}));
vi.mock("@/lib/ai/agent/workspace-knowledge", () => ({
  getWorkspaceKnowledge: mocks.getWorkspaceKnowledge,
}));
vi.mock("@/server/api/ratelimit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/ai/usage", () => ({ recordAiUsage: mocks.recordAiUsage }));
vi.mock("@/features/ai-chat/data", () => ({ persistConversation: mocks.persistConversation }));
vi.mock("@/lib/ai/agent/tool-routing", () => ({
  assertToolRoutingCoversAllTools: mocks.assertToolRoutingCoversAllTools,
  resolveActiveToolGroups: mocks.resolveActiveToolGroups,
  selectActiveToolNames: mocks.selectActiveToolNames,
  shouldWidenForStep: mocks.shouldWidenForStep,
}));

import { POST } from "./route";

const context = {
  organization: { id: "workspace-1", name: "Harly" },
  user: { id: "user-1", name: "Ada Lovelace" },
  role: "recruiter",
  roleKey: "recruiter",
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
    mocks.getRolePolicy.mockResolvedValue({
      scope: { jobAccess: "all", departments: [], regions: [] },
    });
    mocks.getWorkspaceAiConfig.mockResolvedValue(config);
    mocks.getModel.mockReturnValue("model");
    mocks.buildHarlyTools.mockReturnValue({ lookup: { execute: vi.fn() } });
    mocks.buildHarlySystemPrompt.mockReturnValue("system");
    mocks.getWorkspaceKnowledge.mockResolvedValue(null);
    mocks.validateUIMessages.mockResolvedValue([message]);
    mocks.convertToModelMessages.mockResolvedValue([{ role: "user", content: "Hello" }]);
    mocks.enforceRateLimit.mockResolvedValue({ remaining: 1, resetAt: Date.now() + 60_000 });
    mocks.persistConversation.mockResolvedValue(undefined);
    mocks.assertToolRoutingCoversAllTools.mockReturnValue(undefined);
    mocks.resolveActiveToolGroups.mockReturnValue(new Set(["general"]));
    mocks.selectActiveToolNames.mockReturnValue(["lookup"]);
    mocks.shouldWidenForStep.mockImplementation((step: number) => step >= 2);
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

  it("rejects scoped roles before constructing workspace-wide AI tools", async () => {
    mocks.getRolePolicy.mockResolvedValue({
      scope: { jobAccess: "assigned", departments: [], regions: [] },
    });

    const response = await POST(request({ messages: [message] }));

    expect(response.status).toBe(403);
    expect(mocks.getWorkspaceAiConfig).not.toHaveBeenCalled();
    expect(mocks.buildHarlyTools).not.toHaveBeenCalled();
  });

  it("rejects invalid histories and slides oversized ones instead of 413ing", async () => {
    mocks.validateUIMessages.mockRejectedValue(new Error("invalid message"));

    const invalid = await POST(request({ messages: [{ role: "system", parts: [] }] }));

    expect(invalid.status).toBe(400);
    expect(mocks.streamText).not.toHaveBeenCalled();
  });

  it("trims an over-long history to the window and keeps the newest message", async () => {
    mocks.validateUIMessages.mockResolvedValue([message]);
    const history = Array.from({ length: 41 }, (_, index) => ({
      ...message,
      id: `m-${index}`,
    }));
    const response = await POST(request({ messages: history }));

    expect(response.status).toBe(200);
    const sent = mocks.validateUIMessages.mock.calls[0]![0] as {
      messages: Array<{ id: string }>;
    };
    expect(sent.messages.length).toBeLessThanOrEqual(40);
    expect(sent.messages[sent.messages.length - 1]!.id).toBe("m-40");
  });

  it("still 413s a single message that alone exceeds the history budget", async () => {
    const huge = {
      ...message,
      parts: [{ type: "text", text: "x".repeat(100_001) }],
    };
    const response = await POST(request({ messages: [huge] }));

    expect(response.status).toBe(413);
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

  it("narrows the initial tool set via the routing gateway, then widens from step 2 on", async () => {
    mocks.resolveActiveToolGroups.mockReturnValue(new Set(["general", "candidates"]));
    mocks.selectActiveToolNames.mockReturnValue(["lookup"]);

    const response = await POST(request({ messages: [message] }));

    expect(response.status).toBe(200);
    expect(mocks.assertToolRoutingCoversAllTools).toHaveBeenCalledWith(["lookup"]);
    expect(mocks.resolveActiveToolGroups).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Hello", intent: expect.any(String) }),
    );
    expect(mocks.selectActiveToolNames).toHaveBeenCalledWith(["lookup"], expect.any(Set));

    const call = mocks.streamText.mock.calls[0]![0];
    expect(call.activeTools).toEqual(["lookup"]);
    expect(typeof call.prepareStep).toBe("function");
    expect(call.prepareStep({ stepNumber: 1 })).toEqual({});
    expect(call.prepareStep({ stepNumber: 2 })).toEqual({ activeTools: undefined });
  });

  it("gives automation builds a larger bounded orchestration budget", async () => {
    const automationMessage = {
      ...message,
      parts: [{ type: "text", text: "Quiero crear una automatización cuando postule un candidato." }],
    };
    const response = await POST(request({ messages: [automationMessage] }));

    expect(response.status).toBe(200);
    expect(mocks.streamText).toHaveBeenCalledWith(expect.objectContaining({
      maxOutputTokens: 6_144,
    }));
    expect(mocks.streamText.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      stopWhen: { count: 16 },
    }));
  });

  it("slides the history window instead of 413ing a long conversation", async () => {
    const big = (id: string) => ({
      id,
      role: "assistant" as const,
      parts: [{ type: "text", text: `x`.repeat(30_000) }],
    });
    const history = [big("m-1"), big("m-2"), big("m-3"), big("m-4"), message];
    const response = await POST(request({ messages: history }));

    expect(response.status).toBe(200);
    const sent = mocks.validateUIMessages.mock.calls[0]![0] as {
      messages: Array<{ id: string }>;
    };
    // Oldest turns dropped, newest (the current request) always kept.
    expect(sent.messages.length).toBeLessThan(history.length);
    expect(sent.messages[sent.messages.length - 1]!.id).toBe("message-1");
  });

  it("drops tool calls left without output by a cut request so the conversation can continue", async () => {
    const history = [
      message,
      {
        id: "message-2",
        role: "assistant",
        parts: [
          {
            type: "tool-simulateAutomationProposal",
            toolCallId: "call-done",
            state: "output-available",
            input: { proposalId: "p1" },
            output: { ok: true },
          },
          {
            type: "tool-simulateAutomationProposal",
            toolCallId: "call-dangling",
            state: "input-available",
            input: { proposalId: "p2" },
          },
        ],
      },
      { ...message, id: "message-3", parts: [{ type: "text", text: "Continua" }] },
    ];
    const response = await POST(request({ messages: history }));

    expect(response.status).toBe(200);
    expect(mocks.validateUIMessages).toHaveBeenCalledWith({
      messages: [
        history[0],
        {
          id: "message-2",
          role: "assistant",
          parts: [
            {
              type: "tool-simulateAutomationProposal",
              toolCallId: "call-done",
              state: "output-available",
              input: { proposalId: "p1" },
              output: { ok: true },
            },
          ],
        },
        history[2],
      ],
      tools: { lookup: { execute: expect.any(Function) } },
    });
  });
});
