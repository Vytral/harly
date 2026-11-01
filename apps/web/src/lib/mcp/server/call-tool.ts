import "server-only";

import { getActorPermissions } from "@/features/workspaces/permissions-server";
import { createLogger } from "@/lib/logger";
import { sanitizeErrorMessage } from "@/lib/sanitize-error";
import { enforceRateLimit, rateLimitResultFromError } from "@/server/api/ratelimit";

import { runAsMcpActor, type McpActor } from "../actor";
import type { McpToolContext, McpToolDefinition } from "../types";
import { recordToolCall } from "./audit";
import { mapToolError } from "./errors";
import { CALLS_PER_MINUTE, RATE_WINDOW_MS, WRITES_PER_MINUTE } from "./limits";
import { evaluateToolAccess, isWriteTool } from "./policy";
import { formatToolError, formatToolSuccess, type FormattedToolResult } from "./results";

const log = createLogger("mcp");

export type ToolCallEnv = {
  actor: McpActor;
  appOrigin: string;
  ipAddress?: string;
};

async function enforceCallLimits(tool: McpToolDefinition, actor: McpActor): Promise<FormattedToolResult | null> {
  const base = `mcp:${actor.userId}:${actor.clientId}`;
  try {
    await enforceRateLimit(`${base}:calls`, { limit: CALLS_PER_MINUTE, windowMs: RATE_WINDOW_MS });
    if (isWriteTool(tool)) {
      await enforceRateLimit(`${base}:writes`, { limit: WRITES_PER_MINUTE, windowMs: RATE_WINDOW_MS });
    }
    return null;
  } catch (error) {
    const state = rateLimitResultFromError(error);
    if (!state) throw error;
    const seconds = Math.max(1, Math.ceil((state.resetAt - Date.now()) / 1000));
    return formatToolError(
      `Too many requests from this connection. Wait about ${seconds} seconds before calling tools again.`,
      "rate_limited",
    );
  }
}

/**
 * One tool call, end to end: rate limit, re-check of `mcp:use`, scope and Harly
 * permissions against the user's CURRENT role, then the tool itself inside the
 * actor scope, with error mapping, size cap, injection notice and audit.
 * Never throws: every outcome is an MCP tool result.
 */
export async function executeTool(
  tool: McpToolDefinition,
  input: unknown,
  env: ToolCallEnv,
): Promise<FormattedToolResult> {
  const started = Date.now();
  const { actor } = env;
  const write = isWriteTool(tool);
  const record = (outcome: "ok" | "error" | "denied", extra: { errorCode?: string; resultChars?: number } = {}) =>
    recordToolCall({
      actor,
      tool: tool.name,
      write,
      outcome,
      durationMs: Date.now() - started,
      input,
      ipAddress: env.ipAddress,
      ...extra,
    });

  try {
    const limited = await enforceCallLimits(tool, actor);
    if (limited) {
      log.warn({ requestId: actor.requestId, grantId: actor.grantId, tool: tool.name }, "mcp rate limited");
      return limited;
    }

    return await runAsMcpActor(actor, async () => {
      const permissions = await getActorPermissions(actor.workspaceId, actor.userId);
      const access = permissions.includes("mcp:use")
        ? evaluateToolAccess(tool, { scopes: actor.scopes, permissions })
        : "missing_permission";
      if (access !== "ok") {
        await record("denied", { errorCode: access });
        return formatToolError(
          access === "missing_scope"
            ? `This connection was not granted the "${tool.scope}" scope. The user can reconnect and allow it.`
            : "Your Harly role does not allow this action.",
          "forbidden",
        );
      }

      const ctx: McpToolContext = {
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        clientName: actor.clientName,
        requestId: actor.requestId,
        appOrigin: env.appOrigin,
      };
      try {
        const output = await tool.run(input as never, ctx);
        const result = formatToolSuccess(output);
        await record("ok", { resultChars: result.content[result.content.length - 1]?.text.length });
        return result;
      } catch (error) {
        const mapped = mapToolError(error, actor.requestId);
        if (mapped.unexpected) {
          log.error(
            {
              requestId: actor.requestId,
              tool: tool.name,
              // Driver errors embed bound parameters in the message: log it redacted, plus stack frames only.
              err:
                error instanceof Error
                  ? {
                      name: error.name,
                      message: sanitizeErrorMessage(error.message, 200),
                      frames: (error.stack ?? "").split("\n").slice(1, 6).map((line) => line.trim()),
                    }
                  : "unknown",
            },
            "mcp tool failed",
          );
        }
        await record("error", { errorCode: mapped.code });
        return mapped.result;
      }
    });
  } catch (error) {
    // Infrastructure failure around the call (rate-limit store, permission lookup).
    const mapped = mapToolError(error, actor.requestId);
    log.error({ requestId: actor.requestId, tool: tool.name }, "mcp call pipeline failed");
    return mapped.result;
  }
}
