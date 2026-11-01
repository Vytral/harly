import { MCP_SCOPES, type McpScope } from "../types";

export type McpScopeInfo = {
  label: string;
  /** What the AI can do with this scope, in plain language. */
  description: string;
  access: "read" | "write";
};

export const MCP_SCOPE_INFO: Record<McpScope, McpScopeInfo> = {
  "candidates:read": {
    access: "read",
    label: "View candidates",
    description: "Read candidate profiles, contact details, resumes, application answers, notes, scores and pipeline stage.",
  },
  "candidates:write": {
    access: "write",
    label: "Manage candidates",
    description: "Create and edit candidates, add notes and tags, move applications between stages and update scorecards.",
  },
  "jobs:read": { access: "read", label: "View jobs", description: "Read job openings, their pipelines and hiring teams." },
  "jobs:write": { access: "write", label: "Manage jobs", description: "Create, edit, publish and close job openings." },
  "messages:read": { access: "read", label: "Read email", description: "Read your recruiting inbox and the email threads linked to candidates." },
  "messages:send": { access: "write", label: "Send email", description: "Send email to candidates and colleagues from your connected mailbox." },
  "interviews:read": { access: "read", label: "View interviews", description: "Read the interview schedule, panels and feedback you can already see." },
  "interviews:write": { access: "write", label: "Manage interviews", description: "Schedule, reschedule and cancel interviews and submit feedback." },
  "offers:read": { access: "read", label: "View offers", description: "Read offers, compensation details and their approval status." },
  "offers:write": { access: "write", label: "Manage offers", description: "Draft, edit and send offers, and record decisions." },
  "documents:read": { access: "read", label: "View documents", description: "Read documents, templates and e-signature status." },
  "documents:write": { access: "write", label: "Manage documents", description: "Generate documents from templates and send them for signature." },
  "tasks:read": { access: "read", label: "View tasks", description: "Read your tasks and those assigned in your workspace." },
  "tasks:write": { access: "write", label: "Manage tasks", description: "Create, update and complete tasks." },
  "reports:read": { access: "read", label: "View reports", description: "Read hiring analytics such as funnel, time to hire and source reports." },
  "automations:read": { access: "read", label: "View automations", description: "Read workflow automations and their run history." },
  "automations:write": { access: "write", label: "Manage automations", description: "Create, edit, enable and disable workflow automations." },
  "settings:read": { access: "read", label: "View workspace settings", description: "Read workspace configuration such as stages, templates and integrations status." },
  "settings:write": { access: "write", label: "Change workspace settings", description: "Change workspace configuration your role is allowed to change." },
};

export function describeScopes(scopes: readonly McpScope[]) {
  return MCP_SCOPES.filter((s) => scopes.includes(s)).map((scope) => ({ scope, ...MCP_SCOPE_INFO[scope] }));
}
