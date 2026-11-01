import "server-only";

import type { McpToolDefinition } from "../types";
import { automationsTools } from "./ops/automations";
import { reportsTools } from "./ops/reports";
import { settingsTools } from "./ops/settings";
import { tasksTools } from "./ops/tasks";

/**
 * Tasks, reports, automations and settings tools. The implementations live in
 * ./ops/*; this file only aggregates them for tools/index.ts.
 */
export const tasksReportsAutomationsSettingsTools: McpToolDefinition[] = [
  ...tasksTools,
  ...reportsTools,
  ...automationsTools,
  ...settingsTools,
];
