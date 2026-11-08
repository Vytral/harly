import "server-only";

import { getWorkspaceAiConfig, getWorkspaceAiStatus } from "./config";
import {
  AiNotConfiguredError,
  isAiUsable,
} from "./availability-shared";

export * from "./availability-shared";

/**
 * Whether AI is usable for the workspace. Cheap (one settings row); use it to
 * decide what to render. Layouts feed this to `<HarlyAIProvider aiEnabled>`.
 */
export async function isWorkspaceAiEnabled(workspaceId: string): Promise<boolean> {
  return isAiUsable(await getWorkspaceAiStatus(workspaceId));
}

/**
 * Guard for AI-dependent server actions and routes: resolves the decrypted
 * config or throws `AiNotConfiguredError` (never a 500 / generic error).
 */
export async function requireWorkspaceAiConfig(
  workspaceId: string,
  options?: Parameters<typeof getWorkspaceAiConfig>[1],
) {
  const config = await getWorkspaceAiConfig(workspaceId, options);
  if (!config) throw new AiNotConfiguredError();
  return config;
}
