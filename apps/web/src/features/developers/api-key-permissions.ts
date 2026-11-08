import { isApiScope, type ApiScope } from "@harly/api";

import type { Permission } from "@/features/workspaces/permissions";

/**
 * The in-app permission a creator needs before minting a key with each API
 * scope. A key can only grant what its creator could already do in the app,
 * so a role without candidates:edit cannot mint a key with candidates:write.
 * Pure and client-safe; the server action enforces it.
 */
export const API_SCOPE_PERMISSION: Record<ApiScope, Permission> = {
  "jobs:read": "jobs:view",
  "jobs:write": "jobs:edit",
  "jobs:publish": "jobs:publish",
  "jobs:delete": "jobs:delete",
  "candidates:read": "candidates:view",
  "candidates:write": "candidates:edit",
  "applications:read": "candidates:view",
  "applications:write": "candidates:move",
  "applications:reject": "candidates:reject",
  "applications:hire": "candidates:edit",
  "interviews:read": "interviews:feedback",
  "interviews:write": "interviews:manage",
  "offers:read": "offers:manage",
  "offers:write": "offers:manage",
  "offers:decide": "offers:decide",
  "scorecards:read": "candidates:view",
  "scorecards:write": "collab:write",
  "tasks:read": "tasks:read",
  "tasks:write": "tasks:write",
  "notes:read": "candidates:view",
  "notes:write": "collab:write",
  "tags:read": "candidates:view",
  "tags:write": "candidates:edit",
  "stages:read": "jobs:view",
  "stages:write": "jobs:edit",
  "activity:read": "reports:read",
  "pool:read": "candidates:view",
  "pool:write": "candidates:edit",
  "files:read": "candidates:view",
  "webhooks:read": "integrations:manage",
  "webhooks:write": "integrations:manage",
  "webhooks:manage": "integrations:manage",
  "api_keys:read": "integrations:manage",
  "api_keys:write": "integrations:manage",
  "automations:read": "automations:manage",
  "automations:write": "automations:manage",
};

/**
 * Umbrella scopes keep covering what they covered before the finer scopes
 * existed (see LEGACY_SCOPE_ALIASES), so minting one also needs the permissions
 * of everything it still reaches. Existing keys are untouched; new ones cannot
 * smuggle publish, delete, reject, hire or decide past a creator's role.
 */
export const LEGACY_SCOPE_EXTRA_PERMISSIONS: Partial<
  Record<ApiScope, Permission[]>
> = {
  "jobs:write": ["jobs:publish", "jobs:delete"],
  "applications:write": ["candidates:reject", "candidates:edit"],
  "offers:write": ["offers:decide"],
};

export type MissingScopePermission = {
  scope: ApiScope;
  permission: Permission;
};

/** Requested scopes whose covering permission is not in `held`. */
export function missingScopePermissions(
  requested: readonly string[],
  held: readonly string[],
): MissingScopePermission[] {
  const heldSet = new Set(held);
  const missing: MissingScopePermission[] = [];
  for (const scope of requested) {
    if (!isApiScope(scope)) continue;
    for (const permission of [
      API_SCOPE_PERMISSION[scope],
      ...(LEGACY_SCOPE_EXTRA_PERMISSIONS[scope] ?? []),
    ]) {
      if (!heldSet.has(permission)) {
        missing.push({ scope, permission });
        break;
      }
    }
  }
  return missing;
}
