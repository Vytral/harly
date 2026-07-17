import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  validateUIMessages,
  type InferUITools,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { getWorkspaceContextOrNull } from "@/features/workspaces/context";
import { requirePermission } from "@/features/workspaces/permissions-server";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { getModel } from "@/lib/ai/registry";
import { buildHarlyTools } from "@/lib/ai/agent";
import { buildHarlySystemPrompt } from "@/lib/ai/agent/system-prompt";
import { persistConversation } from "@/features/ai-chat/data";
import { recordAiUsage } from "@/lib/ai/usage";
import { enforceRateLimit } from "@/server/api/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_CHAT_BODY_BYTES = 256_000;
const MAX_CHAT_MESSAGES = 40;
const MAX_CHAT_HISTORY_CHARS = 100_000;
const MAX_CHAT_OUTPUT_TOKENS = 2_048;
const CHAT_RATE_LIMIT_WINDOW_MS = 60_000;
const CHAT_WORKSPACE_RATE_LIMIT = 40;
const CHAT_USER_RATE_LIMIT = 12;

const chatRequestSchema = z
  .object({
    messages: z.unknown(),
    conversationId: z.string().uuid().optional(),
    candidateId: z.string().uuid().optional(),
  })
  .strict();

type HarlyChatMessage = UIMessage<
  unknown,
  never,
  InferUITools<ReturnType<typeof buildHarlyTools>>
>;

function requestExceedsBodyLimit(req: Request): boolean {
  const contentLength = Number(req.headers.get("content-length"));
  return Number.isFinite(contentLength) && contentLength > MAX_CHAT_BODY_BYTES;
}

function historyExceedsLimit(messages: unknown[]): boolean {
  return messages.length > MAX_CHAT_MESSAGES || JSON.stringify(messages).length > MAX_CHAT_HISTORY_CHARS;
}

async function consumeSseStream(stream: ReadableStream<string>): Promise<void> {
  const reader = stream.getReader();
  try {
    while (!(await reader.read()).done) {
      // Drain the tee'd stream so provider work and server-side finalization can
      // finish even when the browser disconnects before reading the response.
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(req: Request) {
  const context = await getWorkspaceContextOrNull();
  if (!context) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await requirePermission("collab:write");
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (requestExceedsBodyLimit(req)) {
    return Response.json({ error: "Chat request is too large." }, { status: 413 });
  }

  let rawMessages: unknown[];
  let conversationId: string | undefined;
  let candidateId: string | undefined;
  try {
    const body = chatRequestSchema.parse(await req.json());
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return Response.json({ error: "At least one chat message is required." }, { status: 400 });
    }
    if (historyExceedsLimit(body.messages)) {
      return Response.json({ error: "Chat history is too large." }, { status: 413 });
    }
    rawMessages = body.messages;
    conversationId = body.conversationId;
    candidateId = body.candidateId;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
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

  const workspaceId = context.organization.id;
  const userId = context.user.id;
  const tools = buildHarlyTools({ workspaceId, userId });

  let messages: HarlyChatMessage[];
  try {
    messages = await validateUIMessages<HarlyChatMessage>({
      messages: rawMessages,
      tools,
    });
  } catch {
    return Response.json({ error: "Invalid chat messages." }, { status: 400 });
  }

  // Pair a workspace-wide provider-budget limit with a smaller per-user limit,
  // so one member cannot exhaust the shared workspace allowance.
  try {
    await Promise.all([
      enforceRateLimit(`ai-chat:workspace:${workspaceId}`, {
        limit: CHAT_WORKSPACE_RATE_LIMIT,
        windowMs: CHAT_RATE_LIMIT_WINDOW_MS,
      }),
      enforceRateLimit(`ai-chat:user:${workspaceId}:${userId}`, {
        limit: CHAT_USER_RATE_LIMIT,
        windowMs: CHAT_RATE_LIMIT_WINDOW_MS,
      }),
    ]);
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
    tools,
    // Cap tool round-trips so an adversarial prompt can't loop the provider
    // (IA-15). Bound the whole request just under the route's maxDuration.
    stopWhen: stepCountIs(6),
    maxOutputTokens: MAX_CHAT_OUTPUT_TOKENS,
    abortSignal: req.signal,
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

  // Aggregate all tool-loop steps, not merely the final model call. Attach
  // without blocking streaming and tolerate cancellation/errors.
  void Promise.resolve(result.totalUsage)
    .then((usage) => {
      recordAiUsage({
        surface: "chat",
        provider: config.provider,
        modelId: config.modelId,
        workspaceId,
        userId,
        promptTokens: usage.inputTokens ?? 0,
        completionTokens: usage.outputTokens ?? 0,
      });
    })
    .catch(() => {});

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    // Friendly, non-leaky message sent to the client if the stream fails
    // mid-flight (IA-05 / IA-11).
    onError: () => "Harly AI is temporarily unavailable. Please try again in a moment.",
    consumeSseStream: ({ stream }) => {
      void consumeSseStream(stream).catch((error) => {
        console.error("Failed to consume Harly AI SSE stream", error);
      });
    },
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
