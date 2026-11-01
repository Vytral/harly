import { describe, expect, it } from "vitest";

import {
  BUILTIN_ROLE_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_GROUPS,
  SETTINGS_SECTION_PERMISSION,
  withLegacyRoleDefaults,
  exceedsPrivilege,
  normalizeRoleScope,
  roleLabel,
  rolePolicyIsStrictlyBelow,
  scopeExceedsPrivilege,
} from "@/features/workspaces/permissions";
import { normalizeWorkspaceRole } from "@/features/workspaces/roles";

describe("workspace permissions", () => {
  it("keeps owner as the only all-powerful built-in role by policy, while admin receives explicit full permissions", () => {
    expect(BUILTIN_ROLE_PERMISSIONS.owner).toEqual(PERMISSIONS);
    expect(BUILTIN_ROLE_PERMISSIONS.admin).toEqual(PERMISSIONS);
  });

  it("grants dsar:manage by default to owner and admin, the roles that export consent and audit records", () => {
    expect(BUILTIN_ROLE_PERMISSIONS.owner).toContain("dsar:manage");
    expect(BUILTIN_ROLE_PERMISSIONS.admin).toContain("dsar:manage");
    expect(BUILTIN_ROLE_PERMISSIONS.hiring_manager).not.toContain("dsar:manage");
  });

  it("gives recruiters DSAR review access but not member mutation permissions", () => {
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).toContain("members:read");
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).not.toContain("members:invite");
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).not.toContain("members:edit");
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).not.toContain("members:remove");
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).not.toContain("invite_links:manage");
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).toContain("dsar:manage");
  });

  it("gives recruiting roles report read access", () => {
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).toContain("reports:read");
    expect(BUILTIN_ROLE_PERMISSIONS.hiring_manager).toContain("reports:read");
  });

  it("gives recruiting roles explicit task read/write access", () => {
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).toEqual(
      expect.arrayContaining(["tasks:read", "tasks:write"]),
    );
    expect(BUILTIN_ROLE_PERMISSIONS.hiring_manager).toEqual(
      expect.arrayContaining(["tasks:read", "tasks:write"]),
    );
  });

  it("lets recruiters share documents while keeping that control out of hiring-manager defaults", () => {
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).toEqual(
      expect.arrayContaining(["documents:read", "documents:manage", "documents:share"]),
    );
    expect(BUILTIN_ROLE_PERMISSIONS.hiring_manager).toContain("documents:read");
    expect(BUILTIN_ROLE_PERMISSIONS.hiring_manager).not.toContain("documents:share");
  });

  it("grants MCP use to every recruiting role and MCP management to owner and admin only", () => {
    expect(BUILTIN_ROLE_PERMISSIONS.owner).toEqual(expect.arrayContaining(["mcp:use", "mcp:manage"]));
    expect(BUILTIN_ROLE_PERMISSIONS.admin).toEqual(expect.arrayContaining(["mcp:use", "mcp:manage"]));
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).toContain("mcp:use");
    expect(BUILTIN_ROLE_PERMISSIONS.hiring_manager).toContain("mcp:use");
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).not.toContain("mcp:manage");
    expect(BUILTIN_ROLE_PERMISSIONS.hiring_manager).not.toContain("mcp:manage");
  });

  it("shows both MCP permissions in the role editor", () => {
    const group = PERMISSION_GROUPS.find((g) => g.label === "AI agents (MCP)");
    expect(group?.permissions.map((p) => p.key)).toEqual(["mcp:use", "mcp:manage"]);
  });

  it("gates the AI agents settings page on either MCP permission", () => {
    expect(SETTINGS_SECTION_PERMISSION["/settings/ai-agents"]).toEqual(["mcp:use", "mcp:manage"]);
  });

  it("maps settings sections to the more granular member and security permissions", () => {
    expect(SETTINGS_SECTION_PERMISSION["/settings/members"]).toBe("members:read");
    expect(SETTINGS_SECTION_PERMISSION["/settings/security"]).toBe("security:manage");
    expect(SETTINGS_SECTION_PERMISSION["/settings/legal"]).toEqual([
      "settings:edit",
      "dsar:manage",
    ]);
  });
});

describe("withLegacyRoleDefaults", () => {
  const before = "2026-09-01T00:00:00Z";
  const after = "2026-12-01T00:00:00Z";

  it("adds mcp:use to a recruiter or hiring manager override saved before MCP existed", () => {
    expect(withLegacyRoleDefaults("recruiter", ["jobs:view"], before)).toEqual(["jobs:view", "mcp:use"]);
    expect(withLegacyRoleDefaults("hiring_manager", [], new Date(before))).toEqual(["mcp:use"]);
  });

  it("keeps an override saved after MCP existed exactly as the admin chose", () => {
    expect(withLegacyRoleDefaults("recruiter", ["jobs:view"], after)).toEqual(["jobs:view"]);
  });

  it("never grants anything to custom or admin rows", () => {
    expect(withLegacyRoleDefaults("sourcer", ["jobs:view"], before)).toEqual(["jobs:view"]);
    expect(withLegacyRoleDefaults("admin", ["jobs:view"], before)).toEqual(["jobs:view"]);
  });

  it("does not duplicate or guess when the timestamp is unknown", () => {
    expect(withLegacyRoleDefaults("recruiter", ["mcp:use"], before)).toEqual(["mcp:use"]);
    expect(withLegacyRoleDefaults("recruiter", [], null)).toEqual([]);
  });
});

describe("exceedsPrivilege", () => {
  it("flags granting a permission the actor doesn't hold as escalation", () => {
    expect(
      exceedsPrivilege(["jobs:create", "jobs:edit"], ["jobs:create", "roles:manage"]),
    ).toBe(true);
  });

  it("allows granting a subset of the actor's own permissions", () => {
    expect(
      exceedsPrivilege(
        ["jobs:create", "jobs:edit", "candidates:move"],
        ["jobs:create", "candidates:move"],
      ),
    ).toBe(false);
  });

  it("treats an identical set as within privilege", () => {
    expect(exceedsPrivilege([...PERMISSIONS], [...PERMISSIONS])).toBe(false);
  });

  it("treats an empty grant as always within privilege", () => {
    expect(exceedsPrivilege([], [])).toBe(false);
    expect(exceedsPrivilege(["jobs:create"], [])).toBe(false);
  });

  it("blocks a recruiter from granting admin-level permissions", () => {
    expect(
      exceedsPrivilege(BUILTIN_ROLE_PERMISSIONS.recruiter, [
        ...BUILTIN_ROLE_PERMISSIONS.admin,
      ]),
    ).toBe(true);
  });
});

describe("workspace roles", () => {
  it("orders member-management authority by strict effective privilege", () => {
    const unrestricted = {
      jobAccess: "all" as const,
      departments: [],
      regions: [],
    };
    const scoped = {
      jobAccess: "assigned" as const,
      departments: ["Engineering"],
      regions: [],
    };
    const actor = { permissions: ["members:edit", "jobs:view"], scope: unrestricted };

    expect(
      rolePolicyIsStrictlyBelow(actor, {
        permissions: ["jobs:view"],
        scope: unrestricted,
      }),
    ).toBe(true);
    expect(
      rolePolicyIsStrictlyBelow(actor, {
        permissions: [...actor.permissions],
        scope: unrestricted,
      }),
    ).toBe(false);
    expect(
      rolePolicyIsStrictlyBelow(actor, {
        permissions: [...actor.permissions, "roles:manage"],
        scope: unrestricted,
      }),
    ).toBe(false);
    expect(
      rolePolicyIsStrictlyBelow(actor, {
        permissions: [...actor.permissions],
        scope: scoped,
      }),
    ).toBe(true);
  });

  it("normalizes contextual role scope and removes duplicate/blank filters", () => {
    expect(
      normalizeRoleScope({
        jobAccess: "assigned",
        departments: ["Engineering", "Engineering", " "],
        regions: ["LATAM"],
      }),
    ).toEqual({
      jobAccess: "assigned",
      departments: ["Engineering"],
      regions: ["LATAM"],
    });
  });

  it("normalizes missing stored scope to the documented unrestricted default", () => {
    expect(normalizeRoleScope(null)).toEqual({
      jobAccess: "all",
      departments: [],
      regions: [],
    });
    expect(normalizeRoleScope(undefined)).toEqual({
      jobAccess: "all",
      departments: [],
      regions: [],
    });
    expect(normalizeRoleScope({})).toEqual({
      jobAccess: "all",
      departments: [],
      regions: [],
    });
  });

  it("round-trips every valid saved scope unchanged", () => {
    const saved = [
      { jobAccess: "all", departments: [], regions: [] },
      { jobAccess: "assigned", departments: [], regions: [] },
      { jobAccess: "all", departments: ["Engineering", "Sales"], regions: [] },
      { jobAccess: "all", departments: [], regions: ["EMEA"] },
      { jobAccess: "assigned", departments: ["Engineering"], regions: ["EMEA", "APAC"] },
    ];
    for (const scope of saved) {
      const stored = JSON.parse(JSON.stringify(scope)) as unknown;
      expect(normalizeRoleScope(stored)).toEqual(scope);
    }
  });

  it("fails closed when a present scope has a malformed shape", () => {
    // Most restrictive existing scope: assigned jobs only, no department or region.
    const closed = { jobAccess: "assigned", departments: [], regions: [] };
    const malformed: unknown[] = [
      { departments: "Engineering" },
      { departments: [null] },
      { departments: ["Engineering", 42] },
      { departments: [" "] },
      { jobAccess: "ASSIGNED" },
      { jobAccess: null },
      { jobAccess: "all", regions: "EMEA" },
      { regions: { 0: "EMEA" } },
      "Engineering",
      42,
      true,
      [],
      ["assigned"],
    ];
    for (const raw of malformed) {
      expect(normalizeRoleScope(raw), JSON.stringify(raw)).toEqual(closed);
    }
  });

  it("keeps unknown extra keys from widening or narrowing a valid scope", () => {
    expect(
      normalizeRoleScope({
        jobAccess: "assigned",
        departments: ["Engineering"],
        regions: [],
        futureField: true,
      }),
    ).toEqual({ jobAccess: "assigned", departments: ["Engineering"], regions: [] });
  });

  it("prevents a scoped actor from granting all jobs or broader filters", () => {
    const actor = {
      jobAccess: "assigned" as const,
      departments: ["Engineering"],
      regions: ["LATAM"],
    };
    expect(scopeExceedsPrivilege(actor, { ...actor })).toBe(false);
    expect(scopeExceedsPrivilege(actor, { ...actor, jobAccess: "all" })).toBe(true);
    expect(
      scopeExceedsPrivilege(actor, {
        ...actor,
        departments: ["Engineering", "Sales"],
      }),
    ).toBe(true);
    expect(
      scopeExceedsPrivilege(actor, { ...actor, regions: [] }),
    ).toBe(true);
  });

  it("normalizes unknown role keys only for built-in fallback surfaces", () => {
    expect(normalizeWorkspaceRole("owner")).toBe("owner");
    expect(normalizeWorkspaceRole("custom-sourcer")).toBe("recruiter");
  });

  it("formats raw role keys for display", () => {
    expect(roleLabel("hiring_manager")).toBe("Hiring Manager");
    expect(roleLabel("custom-sourcer")).toBe("Custom Sourcer");
  });
});
