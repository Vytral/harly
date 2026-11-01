import type { Permission } from "@/features/workspaces/permissions";

import type { McpToolDefinition } from "../types";

/**
 * Who may call which tool. Pure so the same rule drives `tools/list` (only
 * callable tools are advertised) and the per-call re-check.
 *
 * A call needs all of: `mcp:use`, the tool's OAuth scope on the token, and every
 * Harly permission the tool declares. Scopes can only narrow what the user's
 * role allows, never widen it.
 */

/**
 * Tools every connected token may call whatever scopes it holds, because they
 * only describe the caller (identity, role, granted scopes) and an agent needs
 * them to explain a refusal.
 */
export const SCOPE_EXEMPT_TOOLS: ReadonlySet<string> = new Set(["workspace_info"]);

export type ToolAccess = "ok" | "missing_scope" | "missing_permission";

export function toolPermissions(tool: Pick<McpToolDefinition, "permission">): Permission[] {
  if (!tool.permission) return [];
  return Array.isArray(tool.permission) ? tool.permission : [tool.permission];
}

export function evaluateToolAccess(
  tool: Pick<McpToolDefinition, "name" | "scope" | "permission">,
  caller: { scopes: readonly string[]; permissions: readonly string[] },
): ToolAccess {
  if (!SCOPE_EXEMPT_TOOLS.has(tool.name) && !caller.scopes.includes(tool.scope)) {
    return "missing_scope";
  }
  const missing = toolPermissions(tool).some((permission) => !caller.permissions.includes(permission));
  return missing ? "missing_permission" : "ok";
}

/** Tools the caller can call right now, in registry order. */
export function callableTools<T extends Pick<McpToolDefinition, "name" | "scope" | "permission">>(
  tools: readonly T[],
  caller: { scopes: readonly string[]; permissions: readonly string[] },
): T[] {
  if (!caller.permissions.includes("mcp:use")) return [];
  return tools.filter((tool) => evaluateToolAccess(tool, caller) === "ok");
}

/** Reads never change anything; everything else counts as a write for limits and audit. */
export function isWriteTool(tool: Pick<McpToolDefinition, "annotations">): boolean {
  return !tool.annotations.readOnlyHint;
}
