import { MCP_SCOPES, type McpScope } from "../types";

export type McpScopeInfo = {
  access: "read" | "write";
};

export const MCP_SCOPE_INFO: Record<McpScope, McpScopeInfo> = {
  "candidates:read": { access: "read" }, "candidates:write": { access: "write" },
  "jobs:read": { access: "read" }, "jobs:write": { access: "write" },
  "messages:read": { access: "read" }, "messages:send": { access: "write" },
  "interviews:read": { access: "read" }, "interviews:write": { access: "write" },
  "offers:read": { access: "read" }, "offers:write": { access: "write" },
  "documents:read": { access: "read" }, "documents:write": { access: "write" },
  "tasks:read": { access: "read" }, "tasks:write": { access: "write" },
  "reports:read": { access: "read" }, "automations:read": { access: "read" },
  "automations:write": { access: "write" }, "settings:read": { access: "read" },
  "settings:write": { access: "write" },
};

export function describeScopes(scopes: readonly McpScope[]) {
  return MCP_SCOPES.filter((s) => scopes.includes(s)).map((scope) => ({
    scope,
    ...MCP_SCOPE_INFO[scope],
    labelKey: `scope.${scope}.label`,
    descriptionKey: `scope.${scope}.description`,
  }));
}
