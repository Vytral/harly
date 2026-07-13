import { describe, expect, it } from "vitest";

import {
  BUILTIN_ROLE_PERMISSIONS,
  PERMISSIONS,
  SETTINGS_SECTION_PERMISSION,
  exceedsPrivilege,
  roleLabel,
} from "@/features/workspaces/permissions";
import { normalizeWorkspaceRole } from "@/features/workspaces/roles";

describe("workspace permissions", () => {
  it("keeps owner as the only all-powerful built-in role by policy, while admin receives explicit full permissions", () => {
    expect(BUILTIN_ROLE_PERMISSIONS.owner).toEqual(PERMISSIONS);
    expect(BUILTIN_ROLE_PERMISSIONS.admin).toEqual(PERMISSIONS);
  });

  it("gives recruiter only read access to members but not mutation permissions", () => {
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).toContain("members:read");
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).not.toContain("members:invite");
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).not.toContain("members:edit");
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).not.toContain("members:remove");
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).not.toContain("invite_links:manage");
  });

  it("maps settings sections to the more granular member and security permissions", () => {
    expect(SETTINGS_SECTION_PERMISSION["/settings/members"]).toBe("members:read");
    expect(SETTINGS_SECTION_PERMISSION["/settings/security"]).toBe("security:manage");
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
  it("normalizes unknown role keys only for built-in fallback surfaces", () => {
    expect(normalizeWorkspaceRole("owner")).toBe("owner");
    expect(normalizeWorkspaceRole("custom-sourcer")).toBe("recruiter");
  });

  it("formats raw role keys for display", () => {
    expect(roleLabel("hiring_manager")).toBe("Hiring Manager");
    expect(roleLabel("custom-sourcer")).toBe("Custom Sourcer");
  });
});
