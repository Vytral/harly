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
import {
  getRolePolicy,
  requirePermission,
} from "@/features/workspaces/permissions-server";
import { getWorkspaceAiConfig } from "@/lib/ai/config";
import { getModel } from "@/lib/ai/registry";
import { toolsForProvider } from "@/lib/ai/provider-tools";
import { buildHarlyTools } from "@/lib/ai/agent";
import { buildHarlySystemPrompt } from "@/lib/ai/agent/system-prompt";
import { getWorkspaceKnowledge } from "@/lib/ai/agent/workspace-knowledge";
import { getHarlyCoreProductContext } from "@/lib/ai/knowledge/harly-product-knowledge";
import { recordHarlyAgentTrace } from "@/lib/ai/agent/observability";
import { classifyHarlyIntent } from "@/lib/ai/agent/intent";
import {
  assertToolRoutingCoversAllTools,
  resolveActiveToolGroups,
  selectActiveToolNames,
  shouldWidenForStep,
} from "@/lib/ai/agent/tool-routing";
import { persistConversation } from "@/features/ai-chat/data";
import { recordAiUsage } from "@/lib/ai/usage";
import { enforceRateLimit } from "@/server/api/ratelimit";

export const runtime = "nodejs";
// Self-hosted (no serverless wall): automation builds chain discovery →
// resources → plan → simulate → confirm in one turn and were repeatedly cut
// at 45s, stranding tool calls and cards. 120s covers a full build; longer
// work must use the durable simulation job and continue next turn.
export const maxDuration = 120;

const MAX_CHAT_BODY_BYTES = 384_000;
const MAX_CHAT_MESSAGES = 40;
const MAX_CHAT_HISTORY_CHARS = 100_000;
const MAX_CHAT_OUTPUT_TOKENS = 3_072;
const MAX_AUTOMATION_OUTPUT_TOKENS = 6_144;
const AUTOMATION_STEP_BUDGET = 16;
const CHAT_RATE_LIMIT_WINDOW_MS = 60_000;
const CHAT_WORKSPACE_RATE_LIMIT = 40;
const CHAT_USER_RATE_LIMIT = 12;

// NOTE: the AI SDK v6 client (DefaultChatTransport / useChat v4) sends extra
// top-level keys (`id`, `trigger`, `messageId`). Only validate the fields we
// consume and ignore the rest, otherwise `.strict()` rejects the request with
// a 400 ("Invalid request body").
const chatRequestSchema = z.object({
  messages: z.unknown(),
  conversationId: z.string().uuid().optional(),
  candidateId: z.string().uuid().optional(),
  mentionedCandidateIds: z.array(z.string().uuid()).max(8).optional(),
  timeZone: z.string().trim().max(80).optional(),
  surfaceContext: z
    .object({
      kind: z.enum(["candidate", "section"]),
      label: z.string().trim().min(1).max(100),
      path: z.string().trim().min(1).max(200),
    })
    .optional(),
  automationContext: z
    .object({
      workflowId: z.string().uuid().nullable().optional(),
      draftRevision: z.number().int().positive().optional(),
      serverContentHash: z.string().length(64).optional(),
      localSnapshotHash: z.string().length(64).optional(),
      contentHash: z.string().length(64).optional(),
      selectedNodeId: z.string().trim().min(1).max(80).optional(),
      validationIssues: z
        .array(
          z.object({
            nodeId: z.string().trim().min(1).max(80),
            fieldPath: z.string().trim().min(1).max(200),
            message: z.string().trim().min(1).max(500),
          }),
        )
        .max(100)
        .optional(),
      activeTab: z.enum(["build", "test", "runs"]).optional(),
      sampleScenario: z.string().trim().max(80).optional(),
      /** True when the panel is open for a draft that has never been saved. */
      isNew: z.boolean().optional(),
      /** True when the local graph has unsaved changes relative to the server. */
      isUnsaved: z.boolean().optional(),
      /**
       * The user's actual unsaved WorkflowGraphV2, sent only while isUnsaved
       * is true (D5). Structural validation happens downstream via
       * parseGraph/validateGraph; this only guards request size (a
       * WorkflowGraphV2 can reach 1 MiB, far more than a chat request should
       * carry) so an oversized graph fails closed as "no local graph" rather
       * than rejecting the whole chat turn.
       */
      graph: z.record(z.string(), z.unknown()).optional(),
      /** Editor positions for preserving layout when a compact patch is applied. */
      layout: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

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
  return (
    messages.length > MAX_CHAT_MESSAGES ||
    JSON.stringify(messages).length > MAX_CHAT_HISTORY_CHARS
  );
}

/**
 * Slide the history window so a long conversation degrades instead of dying
 * with 413: drop oldest whole messages (tool calls/results always travel
 * together inside one assistant message, so nothing is left dangling) while
 * always keeping the newest message, which carries the current request.
 */
function trimHistoryToLimit(rawMessages: unknown[]): unknown[] {
  let messages = [...rawMessages];
  while (messages.length > 1 && historyExceedsLimit(messages)) {
    messages = messages.slice(1);
  }
  return messages;
}

/**
 * Drop tool-call parts that never produced output (e.g. a previous request
 * was cut by the route timeout after the model emitted the call). Leaving
 * them poisons every later turn: the provider rejects the history with
 * "tool result is missing" and the conversation can never continue. Stored
 * history is untouched; this repairs the in-memory request only.
 */
function dropDanglingToolParts(rawMessages: unknown[]): unknown[] {
  return rawMessages.flatMap((message) => {
    if (!message || typeof message !== "object") return [message];
    const record = message as Record<string, unknown>;
    if (!Array.isArray(record.parts)) return [message];
    const parts = (record.parts as unknown[]).filter((part) => {
      if (!part || typeof part !== "object") return true;
      const partRecord = part as Record<string, unknown>;
      if (
        typeof partRecord.type !== "string" ||
        !partRecord.type.startsWith("tool-")
      ) {
        return true;
      }
      return (
        partRecord.state === "output-available" ||
        partRecord.state === "output-error"
      );
    });
    if (parts.length === 0 && record.role !== "user") return [];
    return [{ ...record, parts }];
  });
}

function latestUserText(messages: unknown[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== "object") continue;
    const record = message as Record<string, unknown>;
    if (record.role !== "user") continue;
    if (typeof record.content === "string") return record.content;
    if (!Array.isArray(record.parts)) return "";
    return record.parts
      .filter((part): part is { type: "text"; text: string } =>
        Boolean(
          part &&
          typeof part === "object" &&
          (part as Record<string, unknown>).type === "text" &&
          typeof (part as Record<string, unknown>).text === "string",
        ),
      )
      .map((part) => part.text)
      .join(" ");
  }
  return "";
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

  let userPermissions: import("@/features/workspaces/permissions").Permission[] | undefined;
  try {
    const authorization = await requirePermission("collab:write");
    const policy = await getRolePolicy(
      authorization.organization.id,
      authorization.roleKey,
    );
    const scope = policy.scope;
    userPermissions = policy.permissions;
    if (
      scope.jobAccess !== "all" ||
      scope.departments.length > 0 ||
      scope.regions.length > 0
    ) {
      return Response.json(
        { error: "The AI assistant is unavailable for scoped roles." },
        { status: 403 },
      );
    }
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (requestExceedsBodyLimit(req)) {
    return Response.json(
      { error: "Chat request is too large." },
      { status: 413 },
    );
  }

  let rawMessages: unknown[];
  let conversationId: string | undefined;
  let candidateId: string | undefined;
  let mentionedCandidateIds: string[] = [];
  let timeZone: string | undefined;
  let surfaceContext:
    | { kind: "candidate" | "section"; label: string; path: string }
    | undefined;
  let automationContext:
    | z.infer<typeof chatRequestSchema>["automationContext"]
    | undefined;
  try {
    const body = chatRequestSchema.parse(await req.json());
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return Response.json(
        { error: "At least one chat message is required." },
        { status: 400 },
      );
    }
    const sanitized = dropDanglingToolParts(body.messages);
    // Slide the window instead of dying with 413: a long automation
    // conversation degrades to recent context rather than going silent.
    rawMessages = historyExceedsLimit(sanitized)
      ? trimHistoryToLimit(sanitized)
      : sanitized;
    if (historyExceedsLimit(rawMessages)) {
      return Response.json(
        { error: "Chat history is too large." },
        { status: 413 },
      );
    }
    conversationId = body.conversationId;
    candidateId = body.candidateId;
    mentionedCandidateIds = body.mentionedCandidateIds ?? [];
    timeZone = body.timeZone;
    surfaceContext = body.surfaceContext;
    automationContext = body.automationContext;
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
  const latestMessageText = latestUserText(rawMessages);
  const intent = classifyHarlyIntent(latestMessageText);
  const agentStartedAt = Date.now();
  const agentToolCalls = new Set<string>();
  let agentOutcome: "completed" | "failed" | "aborted" = "completed";
  const workspaceKnowledge = await getWorkspaceKnowledge(
    workspaceId,
    context.organization.name,
  );
  const tools = toolsForProvider(
    buildHarlyTools({
      workspaceId,
      userId,
      permissions: userPermissions,
      activeCandidateId: candidateId,
      mentionedCandidateIds,
      activeAutomation: automationContext,
    }),
    config.provider,
  );

  if (process.env.NODE_ENV !== "production") {
    // Fails loudly in dev/CI, never in prod, if a newly added tool forgot to
    // join a routing group and would otherwise become unreachable once the
    // gateway below narrows the active set (Phase 6, AI10).
    assertToolRoutingCoversAllTools(Object.keys(tools));
  }

  // Tool routing gateway (Phase 6, AI10): with ~77 permission-filtered tools
  // and a bounded step budget, handing the model every schema on every turn wastes
  // tokens and increases tool-selection error. `tools` above stays the full,
  // permission-filtered set — required so `validateUIMessages` below can
  // still validate any tool call from earlier turns in this same
  // conversation. `activeTools` narrows only which of those tools the model
  // may actually invoke in the FIRST step; `prepareStep` widens back to
  // everything from the second step on, so a multi-category task never gets
  // stuck because the initial guess was too narrow.
  const initialToolGroups = resolveActiveToolGroups({
    message: latestMessageText,
    intent,
    activeCandidateId: candidateId,
    mentionedCandidateIds,
    activeAutomation: automationContext,
  });
  const initialActiveTools = selectActiveToolNames(
    Object.keys(tools),
    initialToolGroups,
  ) as Array<keyof typeof tools> | undefined;

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
      activeCandidateId: candidateId,
      mentionedCandidateIds,
      activeSurface: surfaceContext,
      workspaceKnowledge,
      productKnowledge: getHarlyCoreProductContext(),
      intent,
      today: new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date()),
      timeZone,
      activeAutomation: automationContext,
    }),
    messages: await convertToModelMessages(messages),
    tools,
    activeTools: initialActiveTools,
    prepareStep: ({ stepNumber }) => {
      if (shouldWidenForStep(stepNumber)) {
        // From the second step on, drop the narrowing: the model already
        // spent a step calling tools, so re-restricting it now only risks
        // blocking a legitimate multi-category task for no real benefit.
        return { activeTools: undefined };
      }
      return {};
    },
    // Cap tool round-trips so an adversarial prompt can't loop the provider
    // (IA-15), while leaving enough room for the normal resolve → inspect →
    // propose flow. Automation builds get a larger bounded budget and output
    // allowance because a real plan may need tool discovery, batched resource
    // resolution, compilation, branch simulation, and the confirmation card
    // in one turn. This remains a request budget; work past ~110s must use
    // the durable simulation job and continue next turn.
    stopWhen: stepCountIs(intent === "automation_build" ? AUTOMATION_STEP_BUDGET : 8),
    maxOutputTokens:
      intent === "automation_build" ? MAX_AUTOMATION_OUTPUT_TOKENS : MAX_CHAT_OUTPUT_TOKENS,
    abortSignal: req.signal,
    timeout: 110_000,
    onStepFinish: ({ toolCalls }) => {
      for (const call of toolCalls ?? []) agentToolCalls.add(call.toolName);
    },
    onError: (event) => {
      agentOutcome = req.signal.aborted ? "aborted" : "failed";
      // streamText passes { error }, not the error itself — unwrap it or the
      // log shows "[object Object]" and hides the real provider failure.
      const raw = (event as { error?: unknown } | undefined)?.error ?? event;
      const details =
        raw && typeof raw === "object"
          ? {
              name: (raw as Error).name,
              message:
                typeof (raw as Error).message === "string"
                  ? (raw as Error).message.slice(0, 500)
                  : undefined,
              statusCode: (raw as Record<string, unknown>).statusCode,
              code: (raw as Record<string, unknown>).code,
              type: (raw as { error?: { type?: unknown } }).error?.type,
              isAborted: req.signal.aborted,
            }
          : { message: String(raw), isAborted: req.signal.aborted };
      console.error("Harly AI chat stream error", {
        workspaceId,
        provider: config.provider,
        modelId: config.modelId,
        ...details,
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
    onError: () =>
      "Harly AI is temporarily unavailable. Please try again in a moment.",
    consumeSseStream: ({ stream }) => {
      void consumeSseStream(stream).catch((error) => {
        console.error("Failed to consume Harly AI SSE stream", error);
      });
    },
    onFinish: async ({ messages: finalMessages }) => {
      recordHarlyAgentTrace({
        conversationId,
        workspaceId,
        userId,
        toolCalls: [...agentToolCalls],
        outcome: agentOutcome,
        durationMs: Date.now() - agentStartedAt,
        hadWorkspaceEvidence: agentToolCalls.size > 0,
      });
      if (!conversationId) return;
      try {
        await persistConversation({
          conversationId,
          workspaceId,
          userId,
          candidateId,
          mentionedCandidateIds,
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
