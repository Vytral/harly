import type { z } from "zod";

import type { Permission } from "@/features/workspaces/permissions";

/**
 * The contract every Harly MCP tool implements. Tool files live in
 * `lib/mcp/tools/<group>.ts` and export an array of these; `lib/mcp/tools/index.ts`
 * collects them. The MCP runtime (lib/mcp/server/*) turns each definition into
 * an MCP tool, and before `run` is called it:
 *   1. verifies the OAuth token and builds the actor (lib/mcp/actor.ts),
 *   2. checks the user still holds `mcp:use`,
 *   3. checks the token carries `scope`,
 *   4. checks every Harly `permission` listed here for the user's current role,
 *   5. validates `input` with the zod schema,
 *   6. runs `run` inside `runAsMcpActor`, so existing server actions and data
 *      loaders see this user's workspace context and enforce their own checks,
 *   7. writes an audit row, applies rate limits and maps errors.
 * `run` therefore never re-implements auth: it calls the same functions the
 * web app calls and returns plain JSON-serialisable data.
 */

/** OAuth scopes a client can be granted. Read and write are separate per area. */
export const MCP_SCOPES = [
  "candidates:read",
  "candidates:write",
  "jobs:read",
  "jobs:write",
  "messages:read",
  "messages:send",
  "interviews:read",
  "interviews:write",
  "offers:read",
  "offers:write",
  "documents:read",
  "documents:write",
  "tasks:read",
  "tasks:write",
  "reports:read",
  "automations:read",
  "automations:write",
  "settings:read",
  "settings:write",
] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export const MCP_TOOL_GROUPS = [
  "workspace",
  "candidates",
  "pipeline",
  "jobs",
  "messages",
  "interviews",
  "offers",
  "documents",
  "tasks",
  "reports",
  "automations",
  "settings",
] as const;
export type McpToolGroup = (typeof MCP_TOOL_GROUPS)[number];

/** MCP tool annotations (spec: ToolAnnotations). Always set all four explicitly. */
export type McpToolAnnotations = {
  readOnlyHint: boolean;
  /** True when the call deletes, rejects, sends or otherwise can't be undone. */
  destructiveHint: boolean;
  /** True when repeating the same call has no additional effect. */
  idempotentHint: boolean;
  /** True when the call reaches outside Harly (sends email, posts to Slack...). */
  openWorldHint: boolean;
};

export type McpToolContext = {
  workspaceId: string;
  userId: string;
  clientName: string;
  requestId: string;
  /** Public origin of this Harly instance, for building links back into the app. */
  appOrigin: string;
};

export type McpToolDefinition<Input extends z.ZodType = z.ZodType> = {
  /** snake_case, unique, prefixed by area: `candidates_search`, `jobs_update`. */
  name: string;
  /** Short human title shown by clients. */
  title: string;
  /**
   * What it does, when to use it, what it returns, and for writes what it
   * changes. Written for a model: concrete, mentions ids it needs and where to
   * get them (e.g. "use candidates_search to find candidateId").
   */
  description: string;
  group: McpToolGroup;
  /** OAuth scope the token must carry. */
  scope: McpScope;
  /** Harly RBAC permission(s) the user must hold (all of them). Null = any member. */
  permission: Permission | Permission[] | null;
  annotations: McpToolAnnotations;
  /** zod object schema; every field described with `.describe()`. */
  input: Input;
  // Method syntax on purpose: keeps arrays of differently-typed tools assignable
  // to McpToolDefinition[] (parameter bivariance).
  run(input: z.infer<Input>, ctx: McpToolContext): Promise<unknown>;
};

/** Helper so tool files get full inference without repeating generics. */
export function defineMcpTool<Input extends z.ZodType>(
  tool: McpToolDefinition<Input>,
): McpToolDefinition<Input> {
  return tool;
}

/** Thrown by tools for expected, user-facing failures (not found, invalid state). */
export class McpToolError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "invalid_input" | "forbidden" | "conflict" | "unavailable" = "invalid_input",
  ) {
    super(message);
    this.name = "McpToolError";
  }
}
