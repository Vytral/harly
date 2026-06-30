import "server-only";

import { buildReadTools, type HarlyToolContext } from "./tools";
import { buildWriteTools } from "./write-tools";

/**
 * The full Harly AI tool set: workspace-scoped read tools (execute server-side)
 * merged with write tools (confirmed client-side, routed through
 * confirmAgentWriteAction).
 */
export function buildHarlyTools(ctx: HarlyToolContext) {
  return {
    ...buildReadTools(ctx),
    ...buildWriteTools(),
  };
}

export type { HarlyToolContext };
