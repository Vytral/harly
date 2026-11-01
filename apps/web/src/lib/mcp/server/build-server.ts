import "server-only";

import { McpServer } from "@modelcontextprotocol/server";

import type { Permission } from "@/features/workspaces/permissions";

import type { McpActor } from "../actor";
import type { McpToolDefinition } from "../types";
import { executeTool } from "./call-tool";
import { buildServerInstructions } from "./instructions";
import { callableTools } from "./policy";
import { buildServerInfo } from "./server-info";

export type McpServerContext = {
  actor: McpActor;
  appOrigin: string;
  ipAddress?: string;
  version: string;
  workspaceName: string;
  workspaceLogo: string | null;
  /** The user's current Harly permissions (resolved once per request). */
  permissions: readonly Permission[];
  tools: readonly McpToolDefinition[];
  /** Builds the `harly://workspace` resource body; injected so this module stays testable. */
  workspaceSummary?: () => Promise<unknown>;
};

/**
 * One MCP server per HTTP request (stateless): only the tools this user, role
 * and token can call are registered, so `tools/list` is the user's real menu.
 * Each tool callback goes through {@link executeTool}, which re-checks access.
 */
export function createHarlyMcpServer(context: McpServerContext): McpServer {
  const server = new McpServer(
    buildServerInfo({
      workspaceName: context.workspaceName,
      logo: context.workspaceLogo,
      appOrigin: context.appOrigin,
      version: context.version,
    }),
    {
      instructions: buildServerInstructions(context.workspaceName),
      capabilities: { tools: {}, resources: {} },
    },
  );

  const callable = callableTools(context.tools, {
    scopes: context.actor.scopes,
    permissions: context.permissions,
  });

  for (const tool of callable) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        // zod 4 schemas implement Standard Schema + Standard JSON Schema.
        inputSchema: tool.input as never,
        annotations: { title: tool.title, ...tool.annotations },
        _meta: { "harly/scope": tool.scope },
      },
      (async (args: unknown) => {
        return executeTool(tool, args, {
          actor: context.actor,
          appOrigin: context.appOrigin,
          ipAddress: context.ipAddress,
        });
      }) as never,
    );
  }

  const summary = context.workspaceSummary;
  if (summary) {
    server.registerResource(
      "workspace",
      "harly://workspace",
      {
        title: "Workspace summary",
        description: "Who you are acting as in this Harly workspace: workspace name, your role and permissions, and the scopes granted to this connection.",
        mimeType: "application/json",
      },
      async (uri) => ({
        contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(await summary()) }],
      }),
    );
  }

  return server;
}
