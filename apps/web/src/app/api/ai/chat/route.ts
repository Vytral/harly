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
import {
  loadCandidateReferences,
  toolsForModelHistory,
  withRedactedToolErrors,
  withToolResultRedaction,
  type ToolResultRedactionContext,
} from "@/lib/ai/agent/tool-result-redaction";
import { buildHarlySystemPromptParts } from "@/lib/ai/agent/system-prompt";
import {
  getWorkspaceKnowledge,
  workspaceKnowledgeDetailFor,
} from "@/lib/ai/agent/workspace-knowledge";
import { getHarlyProductBrief } from "@/lib/ai/knowledge/harly-product-knowledge";
import {
  compactHistoryForModel,
  withCompactToolOutputs,
} from "@/lib/ai/agent/context-budget";
import {
  buildPromptTokenBreakdown,
  isTokenDebugEnabled,
  measureToolDefinitions,
  systemPromptSections,
  type ToolDefinitionsSize,
} from "@/lib/ai/agent/token-debug";
import { getServerLogger } from "@/lib/logger";
import { getAssistantBranding } from "@/lib/ai/assistant-branding";
import { recordHarlyAgentTrace } from "@/lib/ai/agent/observability";
import { classifyHarlyIntent } from "@/lib/ai/agent/intent";
import {
  assertToolRoutingCoversAllTools,
  buildToolGroupLoader,
  resolveActiveToolGroups,
  selectActiveToolNames,
  TOOL_GROUPS,
  turnNeedsWriteTools,
  type HarlyToolGroup,
} from "@/lib/ai/agent/tool-routing";
import { persistConversation } from "@/features/ai-chat/data";
import { recordAiUsage } from "@/lib/ai/usage";
import {
  DEMO_CHAT_MAX_OUTPUT_TOKENS,
  DEMO_CHAT_STEP_BUDGET,
  withDemoSystemNote,
  withoutDemoBlockedTools,
} from "@/lib/ai/demo";
import { consumeDemoAiDailyBudget, enforceDemoChatIpLimits } from "@/lib/ai/demo-budget";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";
import { isDemoMode } from "@harly/config";

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

/**
 * Automation proposals carry hashes, revisions and graphs the model must pass
 * back verbatim, so their results are never compacted.
 */
const UNCOMPACTED_TOOL_RESULTS: ReadonlySet<string> = new Set(TOOL_GROUPS.automations);

/** Anthropic prompt-cache breakpoint (ignored by every other provider). */
const ANTHROPIC_CACHE_BREAKPOINT = {
  anthropic: { cacheControl: { type: "ephemeral" as const } },
};

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

type SurfaceContext = {
  kind: "candidate" | "section";
  label: string;
  path: string;
};

const ANONYMIZED_SECTION_PATH_RE = /^\/dashboard(?:\/[a-z]+){0,2}$/;
const CANDIDATE_PATH_ID_RE = /\/candidates\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/iu;

/**
 * The page the user is on, as the system prompt may show it. The label and path
 * come from the client, so with anonymization on they are rebuilt from the kind
 * alone: a candidate's name never reaches the model through the page context.
 */
function surfaceForPrompt(
  surface: SurfaceContext | undefined,
  anonymize: boolean,
): SurfaceContext | undefined {
  if (!surface || !anonymize) return surface;
  if (surface.kind === "candidate") {
    const id = CANDIDATE_PATH_ID_RE.exec(surface.path)?.[1];
    return {
      kind: "candidate",
      label: "Candidate profile",
      path: id ? `/dashboard/candidates/${id}` : "/dashboard/candidates",
    };
  }
  return {
    kind: "section",
    label: "Workspace section",
    path: ANONYMIZED_SECTION_PATH_RE.test(surface.path) ? surface.path : "/dashboard",
  };
}

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

/** Tool names called in the last two turns (newest user message excluded). */
function recentToolNames(messages: unknown[], turns = 2): string[] {
  const names = new Set<string>();
  let seenUsers = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const record = messages[index] as Record<string, unknown> | null;
    if (!record || typeof record !== "object") continue;
    if (record.role === "user") {
      seenUsers += 1;
      if (seenUsers > turns) break;
      continue;
    }
    if (!Array.isArray(record.parts)) continue;
    for (const part of record.parts as Array<Record<string, unknown>>) {
      const type = part?.type;
      if (typeof type === "string" && type.startsWith("tool-")) names.add(type.slice(5));
    }
  }
  return [...names];
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

  // Public demo: every visitor shares one account, so add a per-IP budget
  // before resolving config (which spends the instance-wide daily budget).
  if (isDemoMode()) {
    try {
      await enforceDemoChatIpLimits(clientIp(req));
    } catch {
      return Response.json(
        {
          error:
            "You've reached the Harly AI limit for the demo. Try again later.",
        },
        { status: 429 },
      );
    }
  }

  const config = await getWorkspaceAiConfig(context.organization.id, {
    // Demo: spend the daily budget only once the request is known to be valid
    // and within the per-workspace/per-user limits (just before the provider).
    consumeDemoBudget: false,
  });
  if (!config && isDemoMode()) {
    // Demo AI is env-backed; a null config means no demo key is set, not that
    // the visitor should open Settings.
    return Response.json(
      {
        error: "Harly AI isn't available in this demo right now.",
        reason: "demo_ai_unavailable",
      },
      { status: 503 },
    );
  }
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
  const demo = isDemoMode();
  const latestMessageText = latestUserText(rawMessages);
  const intent = classifyHarlyIntent(latestMessageText);
  const agentStartedAt = Date.now();
  const agentToolCalls = new Set<string>();
  let agentOutcome: "completed" | "failed" | "aborted" = "completed";
  // Tool routing gateway: one bounded tool set for the whole turn (routed
  // groups + always-on read helpers + presentUi). See tool-routing.ts.
  const turnToolGroups = resolveActiveToolGroups({
    message: latestMessageText,
    intent,
    activeCandidateId: candidateId,
    mentionedCandidateIds,
    activeAutomation: automationContext,
    recentToolNames: recentToolNames(rawMessages),
  });
  const [workspaceKnowledge, assistantName] = await Promise.all([
    getWorkspaceKnowledge(
      workspaceId,
      context.organization.name,
      workspaceKnowledgeDetailFor({
        message: latestMessageText,
        activeGroups: turnToolGroups,
      }),
    ),
    // Branding is cosmetic: a read failure falls back to the default name.
    getAssistantBranding(workspaceId)
      .then((branding) => branding.assistantName)
      .catch(() => undefined),
  ]);
  // Identity redaction for what the model sees (tool results and earlier turns'
  // results). The raw results still stream to the UI and persist.
  const redaction: ToolResultRedactionContext = {
    anonymize: config.resumeAnonymization,
    conversationKey: conversationId ?? `unsaved:${crypto.randomUUID()}`,
    resolveCandidateReferences: (request) =>
      loadCandidateReferences(workspaceId, request),
  };
  // Groups the model asked for with `loadToolGroups` during this turn.
  const loadedToolGroups = new Set<HarlyToolGroup>();
  let loadedWrites = false;
  const tools = toolsForProvider(
    // Public demo: strip automation, outbound-email and fan-out scoring tools
    // (no-op on normal installs).
    withoutDemoBlockedTools(
      {
        ...buildHarlyTools({
          workspaceId,
          userId,
          permissions: userPermissions,
          activeCandidateId: candidateId,
          mentionedCandidateIds,
          activeAutomation: automationContext,
        }),
        // Widens `activeTools` mid-turn (see prepareStep) when routing was too narrow.
        ...buildToolGroupLoader((groups, includeWrites) => {
          groups.forEach((group) => loadedToolGroups.add(group));
          if (includeWrites) loadedWrites = true;
        }),
      },
      demo,
    ),
    config.provider,
  );

  // Cap read results before they reach the model, then redact. Redaction wraps
  // the compaction hook, so it always sees (and scrubs) the full result first.
  const modelTools = withToolResultRedaction(
    withCompactToolOutputs(tools, UNCOMPACTED_TOOL_RESULTS),
    redaction,
  );

  if (process.env.NODE_ENV !== "production") {
    // Fails loudly in dev/CI, never in prod, if a newly added tool forgot to
    // join a routing group and would otherwise become unreachable once the
    // gateway below narrows the active set (Phase 6, AI10).
    assertToolRoutingCoversAllTools(Object.keys(tools));
  }

  // Tool routing gateway (Phase 6, AI10). `tools` above stays the full,
  // permission-filtered set so `validateUIMessages` can still validate tool
  // calls from earlier turns. `activeTools` narrows what the model is offered
  // and is the SAME on every step of the turn: the full catalog is ~35k tokens
  // of schemas, and re-sending it on every step dominated the prompt. A stable
  // list also keeps the cached prompt prefix (tools → system) byte-identical
  // between steps.
  // Read-only turns ("summarize X") also skip every write schema.
  const turnIncludesWrites = turnNeedsWriteTools({
    message: latestMessageText,
    intent,
    activeAutomation: automationContext,
  });
  const turnActiveTools = selectActiveToolNames(
    Object.keys(tools),
    turnToolGroups,
    { includeWrites: turnIncludesWrites },
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

  // Public demo: one slot of the instance-wide daily budget per chat turn,
  // spent only now that the request has passed every other check.
  if (demo && !(await consumeDemoAiDailyBudget())) {
    return Response.json(
      {
        error: "Harly AI has reached today's demo limit. Try again tomorrow.",
        reason: "demo_budget_exhausted",
      },
      { status: 429 },
    );
  }

  const systemPrompt = buildHarlySystemPromptParts({
    // Per workspace, like the rest of the cached core (workspace memory).
    assistantName,
    workspaceName: context.organization.name,
    userName: context.user.name,
    role: context.role,
    activeCandidateId: candidateId,
    mentionedCandidateIds,
    activeSurface: surfaceForPrompt(surfaceContext, redaction.anonymize),
    workspaceKnowledge,
    productKnowledge: getHarlyProductBrief(),
    intent,
    activeGroups: turnToolGroups,
    today: new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date()),
    timeZone,
    activeAutomation: automationContext,
  });
  const turnContext = withDemoSystemNote(systemPrompt.context, demo);

  const modelMessages = await convertToModelMessages(
    compactHistoryForModel(
      withoutReplayedReasoning(withRedactedToolErrors(messages, redaction)),
    ),
    { tools: toolsForModelHistory(modelTools, redaction) },
  );

  const tokenDebug = isTokenDebugEnabled();
  const tokenLogger = tokenDebug
    ? getServerLogger().child({ component: "ai-token-debug" })
    : null;
  let toolDefinitionsSize: Promise<ToolDefinitionsSize> | null = null;

  const result = streamText({
    model: getModel(config),
    // Stable core first (cache breakpoint: Anthropic renders tools → system,
    // so this caches the tool definitions and the core together), per-turn
    // context (date, user, surface, mentions, routing hint) last.
    system: [
      {
        role: "system",
        content: systemPrompt.core,
        providerOptions: ANTHROPIC_CACHE_BREAKPOINT,
      },
      { role: "system", content: turnContext },
    ],
    messages: modelMessages,
    tools: modelTools,
    activeTools: turnActiveTools,
    // Anthropic automatic caching: a rolling breakpoint on the last block, so
    // step N+1 of a turn (and the next turn) reads step N's prefix from cache.
    providerOptions: ANTHROPIC_CACHE_BREAKPOINT,
    prepareStep: async ({ stepNumber, messages: stepMessages }) => {
      if (tokenLogger) {
        toolDefinitionsSize ??= measureToolDefinitions(
          modelTools as Record<string, unknown>,
          (turnActiveTools as string[] | undefined) ?? undefined,
        );
        tokenLogger.info(
          {
            workspaceId,
            intent,
            groups: [...turnToolGroups],
            ...buildPromptTokenBreakdown({
              step: stepNumber,
              systemSections: {
                ...systemPromptSections("core", systemPrompt.core),
                ...systemPromptSections("context", turnContext),
              },
              tools: await toolDefinitionsSize,
              messages: stepMessages,
              historyCount: modelMessages.length,
            }),
          },
          "ai prompt breakdown",
        );
      }
      // Changing the list costs a cache miss, so only once the model asked.
      if (loadedToolGroups.size > 0 || loadedWrites) {
        const widened = selectActiveToolNames(
          Object.keys(tools),
          new Set([...turnToolGroups, ...loadedToolGroups]),
          { includeWrites: turnIncludesWrites || loadedWrites },
        ) as Array<keyof typeof tools> | undefined;
        return { activeTools: widened ?? (Object.keys(tools) as Array<keyof typeof tools>) };
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
    stopWhen: stepCountIs(
      demo
        ? DEMO_CHAT_STEP_BUDGET
        : intent === "automation_build"
          ? AUTOMATION_STEP_BUDGET
          : 8,
    ),
    maxOutputTokens: demo
      ? DEMO_CHAT_MAX_OUTPUT_TOKENS
      : intent === "automation_build"
        ? MAX_AUTOMATION_OUTPUT_TOKENS
        : MAX_CHAT_OUTPUT_TOKENS,
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
      tokenLogger?.info(
        {
          workspaceId,
          promptTokens: usage.inputTokens ?? 0,
          cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
          cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens ?? 0,
          completionTokens: usage.outputTokens ?? 0,
        },
        "ai prompt usage",
      );
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

/**
 * Earlier turns' reasoning ("thinking") parts are not sent back to the model.
 * Anthropic binds a thinking block's signature to the exact system prompt and
 * tool list of the turn that produced it; both change per turn here (surface
 * context, per-query tool routing), so replaying them fails the whole request
 * with a 400 ("block is bound to a different conversation"). The final text
 * and tool results already carry what the next turn needs.
 */
function withoutReplayedReasoning<T extends { role: string; parts: Array<{ type: string }> }>(
  messages: T[],
): T[] {
  return messages.map((message) =>
    message.role === "assistant"
      ? { ...message, parts: message.parts.filter((part) => part.type !== "reasoning") }
      : message,
  );
}
