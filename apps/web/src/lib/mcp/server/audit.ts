import "server-only";

import { logAuditEvent } from "@/lib/audit-log";
import { createLogger } from "@/lib/logger";
import { touchMcpGrant } from "@/lib/mcp/oauth/grants";

import type { McpActor } from "../actor";
import { summarizeArgs } from "./summarize";

const log = createLogger("mcp");

export type ToolCallRecord = {
  actor: McpActor;
  tool: string;
  write: boolean;
  outcome: "ok" | "error" | "denied";
  errorCode?: string;
  durationMs: number;
  input: unknown;
  ipAddress?: string;
  resultChars?: number;
};

/**
 * Every write (and every denial) gets an audit_logs row; reads only a usage
 * touch on the grant plus a structured log line. Arguments are summarised and
 * results are never stored. Failures here never fail the tool call.
 */
export async function recordToolCall(record: ToolCallRecord): Promise<void> {
  const { actor } = record;
  try {
    log.info(
      {
        requestId: actor.requestId,
        grantId: actor.grantId,
        client: actor.clientName,
        tool: record.tool,
        outcome: record.outcome,
        errorCode: record.errorCode,
        ms: record.durationMs,
        chars: record.resultChars,
      },
      "mcp tool call",
    );
    if (record.outcome === "ok" && !record.write) {
      await touchMcpGrant(actor.grantId);
      return;
    }
    await Promise.all([
      touchMcpGrant(actor.grantId),
      logAuditEvent({
        workspaceId: actor.workspaceId,
        actorId: actor.userId,
        action: record.outcome === "denied" ? "mcp.tool.denied" : record.write ? "mcp.tool.write" : "mcp.tool.read_failed",
        resourceType: "mcp_tool",
        resourceId: record.tool,
        ipAddress: record.ipAddress,
        severity: record.outcome === "denied" ? "warning" : "info",
        metadata: {
          tool: record.tool,
          clientName: actor.clientName,
          clientId: actor.clientId,
          grantId: actor.grantId,
          requestId: actor.requestId,
          outcome: record.outcome,
          errorCode: record.errorCode,
          durationMs: record.durationMs,
          args: summarizeArgs(record.input),
        },
      }),
    ]);
  } catch (error) {
    log.error({ requestId: actor.requestId, err: error instanceof Error ? error.message : "unknown" }, "mcp audit failed");
  }
}
