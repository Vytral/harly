import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The MCP actor seam. Every permission check, server action and data loader in
 * Harly resolves "who is calling" through `resolveWorkspaceContext`
 * (features/workspaces/context.ts), which normally reads the session cookie.
 * An MCP request has no cookie: it carries an OAuth access token instead. The
 * MCP endpoint verifies that token, then runs the tool inside
 * `runAsMcpActor(actor, fn)`; while that async scope is active the workspace
 * context resolves to this user and workspace, so existing server actions run
 * unchanged and enforce exactly the permissions the user has in the app.
 *
 * Only the MCP route may call `runAsMcpActor`, and only after verifying a
 * token. Nothing else should construct an actor.
 */
export type McpActor = {
  userId: string;
  workspaceId: string;
  /** OAuth grant this call was made under (for audit and revocation). */
  grantId: string;
  clientId: string;
  clientName: string;
  /** OAuth scopes the user approved for this client. */
  scopes: readonly string[];
  /** Correlates audit rows and logs for one MCP request. */
  requestId: string;
};

const storage = new AsyncLocalStorage<McpActor>();

export function runAsMcpActor<T>(actor: McpActor, fn: () => Promise<T>): Promise<T> {
  return storage.run(Object.freeze({ ...actor, scopes: Object.freeze([...actor.scopes]) }), fn);
}

/** The MCP actor for the current async scope, or null for normal web requests. */
export function getMcpActor(): McpActor | null {
  return storage.getStore() ?? null;
}
