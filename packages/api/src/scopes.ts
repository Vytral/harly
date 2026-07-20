/**
 * API scopes for the public REST API. These are distinct from the in-app
 * session permissions (features/workspaces/permissions) but conceptually map to
 * them. A secret key (sk_) can hold any scope; a publishable key (pk_) is hard
 * capped to the browser-safe subset.
 */
export const API_SCOPES = [
  "jobs:read",
  "jobs:write",
  "candidates:read",
  "candidates:write",
  "applications:read",
  "applications:write",
  "interviews:read",
  "interviews:write",
  "offers:read",
  "offers:write",
  "scorecards:read",
  "scorecards:write",
  "tasks:read",
  "tasks:write",
  "notes:read",
  "notes:write",
  "tags:read",
  "tags:write",
  "stages:read",
  "stages:write",
  "activity:read",
  "pool:read",
  "pool:write",
  "files:read",
  "webhooks:read",
  "webhooks:write",
  // Legacy umbrella scope. Keep accepting it for existing keys/routes.
  "webhooks:manage",
  "api_keys:read",
  "api_keys:write",
  "automations:read",
  "automations:write",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export type ApiKeyType = "publishable" | "secret";

/** Scopes a publishable (browser-exposed) key is allowed to hold. */
export const PUBLISHABLE_SCOPES: ApiScope[] = ["jobs:read", "applications:write"];

export function isApiScope(value: string): value is ApiScope {
  return (API_SCOPES as readonly string[]).includes(value);
}

/** Clamp a requested scope set to what the given key type may hold. */
export function allowedScopesForType(
  type: ApiKeyType,
  requested: readonly string[],
): ApiScope[] {
  const valid = requested.filter(isApiScope);
  if (type === "publishable") {
    return valid.filter((scope) => PUBLISHABLE_SCOPES.includes(scope));
  }
  return valid;
}
