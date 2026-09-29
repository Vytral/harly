import "server-only";

import { demoAiSettings, demoWorkspaceId, isDemoMode } from "@harly/config";

import type { AiModelConfig } from "./providers";

/**
 * Public-demo Harly AI policy.
 *
 * The demo reseed wipes any key stored on the workspace, so when
 * DEMO_MODE=true and DEMO_AI_API_KEY is set, AI resolves from env instead.
 * Every visitor shares one account, so per-user limits are effectively global;
 * the limits here add a per-IP budget and an instance-wide daily ceiling. The
 * hard stop is still the spend cap on the key's OpenAI project.
 *
 * This module is DB-free (imported by agent tool code); budgets that need the
 * rate limiter live in ./demo-budget.
 */

/** Tighter per-turn budgets for demo chat (a normal turn fits well inside). */
export const DEMO_CHAT_STEP_BUDGET = 6;
export const DEMO_CHAT_MAX_OUTPUT_TOKENS = 1_536;

/**
 * Agent tools a demo visitor must not reach from chat:
 * - automations: the demo shows display-only examples; these tools read or
 *   mutate real workflows and enqueue durable simulation jobs;
 * - sendCandidateEmail: outbound email is suppressed anyway, keep the model
 *   from promising it;
 * - bulkScoreJob: fans out one LLM call per applicant.
 */
export const DEMO_BLOCKED_AGENT_TOOLS: ReadonlySet<string> = new Set([
  "listAutomationTools",
  "getAutomationContext",
  "getAutomationSubgraph",
  "searchAutomations",
  "resolveAutomationResources",
  "prepareAutomationPatch",
  "rebaseAutomationPatch",
  "simulateAutomationProposal",
  "queueAutomationSimulation",
  "getAutomationJob",
  "runBranchCoverage",
  "prepareAutomationPlan",
  "diagnoseWorkflowRun",
  "prepareAutomationRepair",
  "applyAutomationProposal",
  "retryAutomationRun",
  "reconcileAutomationRun",
  "replayAutomationRun",
  "sendCandidateEmail",
  "bulkScoreJob",
]);

export function isDemoBlockedAgentTool(name: string, demo = isDemoMode()): boolean {
  return demo && DEMO_BLOCKED_AGENT_TOOLS.has(name);
}

const DEMO_SYSTEM_NOTE = [
  "## Public demo",
  "This is a shared public demo workspace with sample data that resets every few hours.",
  "Automations, outbound email and bulk scoring are unavailable here: if asked, say they are disabled in the demo instead of attempting them.",
  "Keep answers short and focused.",
].join("\n");

/** Append the demo constraints to the system prompt (no-op outside demo mode). */
export function withDemoSystemNote(system: string, demo = isDemoMode()): string {
  return demo ? `${system}\n\n${DEMO_SYSTEM_NOTE}` : system;
}

/** Drop demo-blocked tools from a tool map (no-op outside demo mode). */
export function withoutDemoBlockedTools<T extends Record<string, unknown>>(
  tools: T,
  demo = isDemoMode(),
): T {
  if (!demo) return tools;
  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => !DEMO_BLOCKED_AGENT_TOOLS.has(name)),
  ) as T;
}

/**
 * Env-backed AI config for the demo workspace, or null when this is not a
 * demo instance, no demo key is configured, or the workspace is not the
 * pinned demo workspace.
 */
export function getDemoAiModelConfig(
  workspaceId: string,
  source: Record<string, string | undefined> = process.env,
): AiModelConfig | null {
  const settings = demoAiSettings(source);
  if (!settings) return null;
  const pinned = demoWorkspaceId(source);
  if (pinned && pinned !== workspaceId) return null;
  return { provider: "openai", modelId: settings.modelId, apiKey: settings.apiKey };
}
