import "server-only";

import type { McpToolDefinition } from "../types";
import { candidatesTools } from "./candidates";
import { jobsTools } from "./jobs";
import { messagesTools } from "./messages";
import { interviewsOffersDocumentsTools } from "./interviews-offers-documents";
import { tasksReportsAutomationsSettingsTools } from "./tasks-reports-automations-settings";
import { workspaceTools } from "./workspace";

/**
 * Every tool the Harly MCP server exposes. Names must be unique; the registry
 * test (tools/index.test.ts) enforces naming, scopes and annotations.
 */
export const MCP_TOOLS: McpToolDefinition[] = [
  ...workspaceTools,
  ...candidatesTools,
  ...jobsTools,
  ...messagesTools,
  ...interviewsOffersDocumentsTools,
  ...tasksReportsAutomationsSettingsTools,
];
