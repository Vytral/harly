import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";

import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { getModel } from "@/lib/ai/registry";
import { buildHarlyTools } from "@/lib/ai/agent";
import { buildHarlySystemPrompt } from "@/lib/ai/agent/system-prompt";
import { persistConversation } from "@/features/ai-chat/data";
import { recordAiUsage } from "@/lib/ai/usage";
import { enforceRateLimit } from "@/server/api/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const context = await getWorkspaceContextOrNull();
  if (!context) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getWorkspaceAiConfig(context.organization.id);
  if (!config) {
    return Response.json(
      {
        error: "AI is not configured for this workspace.",
        reason: "not_configured",
      },
      { status: 400 },
    );
  }

  let messages: UIMessage[];
  let conversationId: string | undefined;
  let candidateId: string | undefined;
  try {
    const body = (await req.json()) as {
      messages?: UIMessage[];
      conversationId?: string;
      candidateId?: string;
    };
    messages = body.messages ?? [];
    conversationId = body.conversationId;
    candidateId = body.candidateId;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const workspaceId = context.organization.id;
  const userId = context.user.id;

  // Per-workspace rate limit so one workspace can't exhaust the shared AI
  // provider budget. 40 requests / minute is generous for interactive chat.
  try {
    await enforceRateLimit(`ai-chat:${workspaceId}`, { limit: 40, windowMs: 60_000 });
  } catch {
    return Response.json(
      { error: "Rate limit exceeded. Slow down and try again shortly." },
      { status: 429 },
    );
  }

  const result = streamText({
    model: getModel(config),
    system: buildHarlySystemPrompt({
      workspaceName: context.organization.name,
      userName: context.user.name,
      role: context.role,
      today: new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date()),
    }),
    messages: await convertToModelMessages(messages),
    tools: buildHarlyTools({ workspaceId, userId }),
    // Cap tool round-trips so an adversarial prompt can't loop the provider
    // (IA-15). Bound the whole request just under the route's maxDuration.
    stopWhen: stepCountIs(6),
    timeout: 28_000,
    onError: (error) => {
      console.error("Harly AI chat stream error", {
        workspaceId,
        provider: config.provider,
        modelId: config.modelId,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });

  // Capture token usage for observability (IA-04). `result.usage` resolves once
  // the stream finishes; attach without blocking the response.
  void result.usage.then((usage) => {
    recordAiUsage({
      surface: "chat",
      provider: config.provider,
      modelId: config.modelId,
      workspaceId,
      userId,
      promptTokens: usage.inputTokens ?? 0,
      completionTokens: usage.outputTokens ?? 0,
    });
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    // Friendly, non-leaky message sent to the client if the stream fails
    // mid-flight (IA-05 / IA-11).
    onError: () => "Harly AI is temporarily unavailable. Please try again in a moment.",
    onFinish: async ({ messages: finalMessages }) => {
      if (!conversationId) return;
      try {
        await persistConversation({
          conversationId,
          workspaceId,
          userId,
          candidateId,
          messages: finalMessages.map((m) => ({
            role: m.role,
            parts: m.parts as unknown[],
          })),
        });
      } catch (error) {
        console.error("Failed to persist Harly AI conversation", error);
      }
    },
  });
}
