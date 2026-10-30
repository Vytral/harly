import { describe, expect, it } from "vitest";
import { API_SCOPES } from "@harly/api";

import { PERMISSIONS } from "@/features/workspaces/permissions";

import {
  API_SCOPE_PERMISSION,
  missingScopePermissions,
} from "./api-key-permissions";

describe("API scope to permission mapping", () => {
  it("maps every API scope to a real in-app permission", () => {
    for (const scope of API_SCOPES) {
      expect(PERMISSIONS, scope).toContain(API_SCOPE_PERMISSION[scope]);
    }
  });

  it("reports only the scopes whose permission the creator lacks", () => {
    const missing = missingScopePermissions(
      ["jobs:read", "candidates:write"],
      ["jobs:view", "candidates:view"],
    );
    expect(missing).toEqual([
      { scope: "candidates:write", permission: "candidates:edit" },
    ]);
  });

  it("allows every scope when the creator holds the covering permissions", () => {
    expect(
      missingScopePermissions(
        ["candidates:write", "api_keys:write", "webhooks:manage"],
        ["candidates:edit", "integrations:manage"],
      ),
    ).toEqual([]);
  });

  it("ignores values that are not API scopes", () => {
    expect(missingScopePermissions(["not:a-scope"], [])).toEqual([]);
  });
});
