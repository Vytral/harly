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
  try {
    const body = (await req.json()) as {
      messages?: UIMessage[];
      conversationId?: string;
    };
    messages = body.messages ?? [];
    conversationId = body.conversationId;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const workspaceId = context.organization.id;
  const userId = context.user.id;

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
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages: finalMessages }) => {
      if (!conversationId) return;
      try {
        await persistConversation({
          conversationId,
          workspaceId,
          userId,
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
