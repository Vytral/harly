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

  it("makes umbrella scopes need the permissions of everything they still reach", () => {
    const held = ["jobs:edit", "offers:manage", "candidates:move", "candidates:edit"];
    expect(
      missingScopePermissions(["jobs:write", "offers:write", "applications:write"], held).map(
        (item) => item.scope,
      ),
    ).toEqual(["jobs:write", "offers:write", "applications:write"]);
    expect(
      missingScopePermissions(
        ["jobs:write", "offers:write", "applications:write"],
        [
          ...held,
          "jobs:publish",
          "jobs:delete",
          "offers:decide",
          "candidates:reject",
        ],
      ),
    ).toEqual([]);
  });

  it("maps the finer scopes to their own permission", () => {
    expect(API_SCOPE_PERMISSION["jobs:publish"]).toBe("jobs:publish");
    expect(API_SCOPE_PERMISSION["jobs:delete"]).toBe("jobs:delete");
    expect(API_SCOPE_PERMISSION["offers:decide"]).toBe("offers:decide");
    expect(API_SCOPE_PERMISSION["applications:reject"]).toBe("candidates:reject");
    expect(API_SCOPE_PERMISSION["applications:hire"]).toBe("candidates:edit");
  });
});
