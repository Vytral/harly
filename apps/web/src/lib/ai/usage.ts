import "server-only";

import { db, aiUsageEvents } from "@harly/db";

import { getServerLogger } from "@/lib/logger";

const usageLogger = getServerLogger().child({ component: "ai-usage" });

export type AiUsageEvent = {
  surface: string;
  provider: string;
  modelId: string;
  workspaceId?: string;
  userId?: string;
  promptTokens: number;
  completionTokens: number;
};

// Process-global ring buffer for in-process recent-usage queries (diagnostics /
// a future live view) — the durable record lives in `ai_usage_events`.
const MAX_EVENTS = 500;

const store: { events: AiUsageEvent[] } =
  globalThis as unknown as { events: AiUsageEvent[] };
if (!store.events) store.events = [];

/** Record token usage for one AI call. Fire-and-forget; never throws. */
export function recordAiUsage(event: AiUsageEvent): void {
  try {
    usageLogger.info(
      {
        surface: event.surface,
        provider: event.provider,
        modelId: event.modelId,
        workspaceId: event.workspaceId,
        userId: event.userId,
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
      },
      "ai usage",
    );
    store.events.push(event);
    if (store.events.length > MAX_EVENTS) {
      store.events.splice(0, store.events.length - MAX_EVENTS);
    }

    // Durable, per-call accounting (IA-04). Inserted best-effort so a DB hiccup
    // can never break the AI call.
    void db
      .insert(aiUsageEvents)
      .values({
        workspaceId: event.workspaceId ?? null,
        userId: event.userId ?? null,
        surface: event.surface,
        provider: event.provider,
        modelId: event.modelId,
        promptTokens: event.promptTokens,
        completionTokens: event.completionTokens,
      })
      .catch(() => {});
  } catch {
    // Observability must never break the AI call.
  }
}

/** Most-recent-first list of recorded usage events (for diagnostics/UI). */
export function getRecentAiUsage(limit = MAX_EVENTS): AiUsageEvent[] {
  return store.events.slice(-limit).reverse();
}
