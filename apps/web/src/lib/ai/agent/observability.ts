import "server-only";

import { getServerLogger } from "@/lib/logger";

const traceLogger = getServerLogger().child({ component: "harly-agent" });
const MAX_TRACES = 500;

export type HarlyAgentTrace = {
  conversationId?: string;
  workspaceId: string;
  userId: string;
  toolCalls: string[];
  outcome: "completed" | "failed" | "aborted";
  durationMs: number;
  hadWorkspaceEvidence: boolean;
};

const store: { traces?: HarlyAgentTrace[] } = globalThis as unknown as {
  traces?: HarlyAgentTrace[];
};
if (!store.traces) store.traces = [];

/** Record redacted agent telemetry; raw prompts, responses, ids and PII stay out. */
export function recordHarlyAgentTrace(trace: HarlyAgentTrace): void {
  try {
    const normalized = {
      ...trace,
      toolCalls: [...new Set(trace.toolCalls)].slice(0, 50),
    };
    traceLogger.info(normalized, "harly agent trace");
    store.traces!.push(normalized);
    if (store.traces!.length > MAX_TRACES) {
      store.traces!.splice(0, store.traces!.length - MAX_TRACES);
    }
  } catch {
    // Observability must never affect the user-facing AI request.
  }
}

export function getRecentHarlyAgentTraces(
  limit = MAX_TRACES,
): HarlyAgentTrace[] {
  return store.traces!.slice(-limit).reverse();
}
