import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  BUILTIN_ROLES,
  BUILTIN_ROLE_DESCRIPTIONS,
  BUILTIN_ROLE_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_GROUPS,
  SETTINGS_SECTION_PERMISSION,
  builtinRoleDefaultScope,
  builtinRoleScope,
  rolePolicyIsStrictlyBelow,
  unrestrictedRoleScope,
  type BuiltinRole,
  type Permission,
  type RoleScope,
} from "./permissions";

/**
 * Explicit role x permission matrix. Any change to a default role must be made
 * here too, so widening or narrowing a role is always a deliberate, reviewed
 * edit rather than a side effect. Owner and admin hold every permission.
 */
const EXPECTED: Record<Exclude<BuiltinRole, "owner" | "admin">, Permission[]> = {
  recruiter: [
    "jobs:create",
    "jobs:view",
    "jobs:edit",
    "jobs:publish",
    "hiring_team:manage",
    "candidates:view",
    "candidates:edit",
    "candidates:reject",
    "candidates:export",
    "candidates:move",
    "collab:write",
    "interviews:manage",
    "interviews:feedback",
    "tasks:read",
    "tasks:write",
    "offers:manage",
    "offers:decide",
    "templates:manage",
    "reports:read",
    "members:read",
    "dsar:manage",
    "documents:read",
    "documents:manage",
    "documents:share",
    "automations:manage",
    "mcp:use",
  ],
  hiring_manager: [
    "jobs:view",
    "jobs:edit",
    "jobs:approve",
    "candidates:view",
    "candidates:move",
    "collab:write",
    "interviews:feedback",
    "tasks:read",
    "tasks:write",
    "members:read",
    "reports:read",
    "documents:read",
    "mcp:use",
  ],
  coordinator: [
    "jobs:view",
    "candidates:view",
    "candidates:move",
    "collab:write",
    "interviews:manage",
    "interviews:feedback",
    "tasks:read",
    "tasks:write",
    "documents:read",
    "members:read",
  ],
  sourcer: [
    "jobs:view",
    "candidates:view",
    "candidates:edit",
    "collab:write",
    "tasks:read",
    "tasks:write",
    "documents:read",
    "members:read",
  ],
  interviewer: [
    "jobs:view",
    "candidates:view",
    "collab:write",
    "interviews:feedback",
    "tasks:read",
    "documents:read",
  ],
  viewer: ["jobs:view", "candidates:view", "tasks:read", "documents:read", "reports:read"],
};

/** Permissions only owner/admin hold by default: nobody below gets them silently. */
const ADMIN_ONLY: Permission[] = [
  "jobs:delete",
  "candidates:delete",
  "offers:approve",
  "members:invite",
  "members:edit",
  "members:remove",
  "invite_links:manage",
  "settings:edit",
  "integrations:manage",
  "roles:manage",
  "security:manage",
  "mcp:manage",
];

/** Permissions that write or change data. The viewer may hold none of them. */
const WRITE_PERMISSIONS = PERMISSIONS.filter(
  (permission) =>
    !permission.endsWith(":view") &&
    !permission.endsWith(":read") &&
    permission !== "mcp:use",
);

/** A write permission is useless (and incoherent) without its read counterpart. */
const REQUIRES: Partial<Record<Permission, Permission[]>> = {
  "jobs:create": ["jobs:view"],
  "jobs:edit": ["jobs:view"],
  "jobs:delete": ["jobs:view"],
  "jobs:publish": ["jobs:view", "jobs:edit"],
  "jobs:approve": ["jobs:view"],
  "hiring_team:manage": ["jobs:view"],
  "candidates:edit": ["candidates:view"],
  "candidates:reject": ["candidates:view"],
  "candidates:delete": ["candidates:view"],
  "candidates:export": ["candidates:view"],
  "candidates:move": ["candidates:view"],
  "collab:write": ["candidates:view"],
  "interviews:manage": ["candidates:view"],
  "interviews:feedback": ["candidates:view"],
  "offers:manage": ["candidates:view"],
  "offers:approve": ["candidates:view"],
  "offers:decide": ["candidates:view"],
  "tasks:write": ["tasks:read"],
  "documents:manage": ["documents:read"],
  "documents:share": ["documents:read"],
  "members:invite": ["members:read"],
  "members:edit": ["members:read"],
  "members:remove": ["members:read"],
};

describe("built-in role x permission matrix", () => {
  it("lists exactly the expected built-in roles", () => {
    expect([...BUILTIN_ROLES]).toEqual([
      "owner",
      "admin",
      "recruiter",
      "hiring_manager",
      "coordinator",
      "sourcer",
      "interviewer",
      "viewer",
    ]);
  });

  it("describes every built-in role in one line", () => {
    for (const role of BUILTIN_ROLES) {
      expect(BUILTIN_ROLE_DESCRIPTIONS[role], role).toMatch(/\S/);
      expect(BUILTIN_ROLE_DESCRIPTIONS[role]).not.toContain("\n");
    }
  });

  it("gives owner and admin every permission", () => {
    expect([...BUILTIN_ROLE_PERMISSIONS.owner].sort()).toEqual([...PERMISSIONS].sort());
    expect([...BUILTIN_ROLE_PERMISSIONS.admin].sort()).toEqual([...PERMISSIONS].sort());
  });

  // Every role x every permission, so the whole grid is pinned.
  for (const role of Object.keys(EXPECTED) as Array<keyof typeof EXPECTED>) {
    it(`pins ${role} on every permission`, () => {
      for (const permission of PERMISSIONS) {
        expect(
          BUILTIN_ROLE_PERMISSIONS[role].includes(permission),
          `${role} x ${permission}`,
        ).toBe(EXPECTED[role].includes(permission));
      }
    });

    it(`keeps admin-only permissions away from ${role}`, () => {
      for (const permission of ADMIN_ONLY) {
        expect(BUILTIN_ROLE_PERMISSIONS[role], permission).not.toContain(permission);
      }
    });
  }

  it("never lists a permission twice or one that is not defined", () => {
    for (const role of BUILTIN_ROLES) {
      const list = BUILTIN_ROLE_PERMISSIONS[role];
      expect(new Set(list).size, role).toBe(list.length);
      for (const permission of list) {
        expect(PERMISSIONS, `${role}:${permission}`).toContain(permission);
      }
    }
  });

  it("never grants a write permission without the read permission it needs", () => {
    for (const role of BUILTIN_ROLES) {
      const held = new Set(BUILTIN_ROLE_PERMISSIONS[role]);
      for (const permission of held) {
        for (const needed of REQUIRES[permission] ?? []) {
          expect(held.has(needed), `${role}: ${permission} needs ${needed}`).toBe(true);
        }
      }
    }
  });

  it("covers every write permission with a read requirement", () => {
    const uncovered = WRITE_PERMISSIONS.filter(
      (permission) =>
        !(permission in REQUIRES) &&
        // Standalone capabilities that do not read a record first.
        ![
          "dsar:manage",
          "templates:manage",
          "automations:manage",
          "invite_links:manage",
          "settings:edit",
          "integrations:manage",
          "roles:manage",
          "security:manage",
          "mcp:manage",
        ].includes(permission),
    );
    expect(uncovered).toEqual([]);
  });

  it("keeps the viewer strictly read-only", () => {
    for (const permission of WRITE_PERMISSIONS) {
      expect(BUILTIN_ROLE_PERMISSIONS.viewer, permission).not.toContain(permission);
    }
  });

  it("separates publishing, approving, rejecting and deciding", () => {
    expect(BUILTIN_ROLE_PERMISSIONS.hiring_manager).toContain("jobs:approve");
    expect(BUILTIN_ROLE_PERMISSIONS.hiring_manager).not.toContain("jobs:publish");
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).toContain("jobs:publish");
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).not.toContain("jobs:approve");
    // The recruiter records candidate answers and rejects, but cannot delete.
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).toContain("offers:decide");
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).toContain("candidates:reject");
    expect(BUILTIN_ROLE_PERMISSIONS.recruiter).not.toContain("candidates:delete");
    // Neither the hiring manager nor the lighter roles decide offers or reject.
    for (const role of ["hiring_manager", "coordinator", "sourcer", "interviewer", "viewer"] as const) {
      expect(BUILTIN_ROLE_PERMISSIONS[role], role).not.toContain("offers:decide");
      expect(BUILTIN_ROLE_PERMISSIONS[role], role).not.toContain("candidates:reject");
      expect(BUILTIN_ROLE_PERMISSIONS[role], role).not.toContain("candidates:export");
    }
  });
});

describe("built-in role scope", () => {
  it("limits only the interviewer to assigned jobs by default", () => {
    for (const role of BUILTIN_ROLES) {
      const scope = builtinRoleDefaultScope(role);
      if (role === "interviewer") {
        expect(scope).toEqual({ jobAccess: "assigned", departments: [], regions: [] });
      } else {
        expect(scope, role).toEqual(unrestrictedRoleScope());
      }
    }
  });

  it("keeps the default scope when the stored scope is the empty column default", () => {
    expect(builtinRoleScope("interviewer", {}).jobAccess).toBe("assigned");
    expect(builtinRoleScope("interviewer", null).jobAccess).toBe("assigned");
  });

  it("lets an explicit saved scope win, and fails closed on a malformed one", () => {
    expect(
      builtinRoleScope("interviewer", { jobAccess: "all", departments: [], regions: [] }),
    ).toEqual(unrestrictedRoleScope());
    expect(builtinRoleScope("recruiter", { jobAccess: "bogus" }).jobAccess).toBe("assigned");
    expect(builtinRoleScope("custom-role", {})).toEqual(unrestrictedRoleScope());
  });
});

describe("privilege ceiling with the built-in roles", () => {
  const policy = (role: BuiltinRole) => ({
    permissions: BUILTIN_ROLE_PERMISSIONS[role],
    scope: builtinRoleDefaultScope(role),
  });
  const below = (actor: BuiltinRole, target: BuiltinRole) =>
    rolePolicyIsStrictlyBelow(policy(actor), policy(target));

  it("lets an admin assign every role except admin itself and owner", () => {
    expect(below("admin", "admin")).toBe(false);
    for (const role of ["recruiter", "hiring_manager", "coordinator", "sourcer", "interviewer", "viewer"] as const) {
      expect(below("admin", role), role).toBe(true);
    }
  });

  it("never lets a role assign itself or a peer", () => {
    for (const role of BUILTIN_ROLES) {
      expect(below(role, role), role).toBe(false);
    }
  });

  it("lets the recruiter assign the lighter recruiting roles but not the hiring manager", () => {
    for (const role of ["coordinator", "sourcer", "interviewer", "viewer"] as const) {
      expect(below("recruiter", role), role).toBe(true);
    }
    // The hiring manager approves jobs, which the recruiter cannot.
    expect(below("recruiter", "hiring_manager")).toBe(false);
  });

  it("never lets a lighter role climb to a stronger one", () => {
    const ladder: BuiltinRole[] = [
      "viewer",
      "interviewer",
      "sourcer",
      "coordinator",
      "hiring_manager",
      "recruiter",
      "admin",
      "owner",
    ];
    for (const lighter of ["viewer", "interviewer", "sourcer", "coordinator", "hiring_manager"] as const) {
      for (const stronger of ladder.slice(ladder.indexOf(lighter) + 1)) {
        if (stronger === "owner") continue;
        const stronglyHeld = policy(stronger);
        if (rolePolicyIsStrictlyBelow(stronglyHeld, policy(lighter))) {
          expect(below(lighter, stronger), `${lighter} -> ${stronger}`).toBe(false);
        }
      }
    }
    expect(below("viewer", "recruiter")).toBe(false);
    expect(below("sourcer", "recruiter")).toBe(false);
    expect(below("coordinator", "admin")).toBe(false);
  });

  it("does not let an assigned-only actor hand out a role with all-job access", () => {
    const assignedActor = {
      permissions: BUILTIN_ROLE_PERMISSIONS.recruiter,
      scope: { jobAccess: "assigned", departments: [], regions: [] } satisfies RoleScope,
    };
    expect(rolePolicyIsStrictlyBelow(assignedActor, policy("viewer"))).toBe(false);
    expect(
      rolePolicyIsStrictlyBelow(assignedActor, {
        permissions: BUILTIN_ROLE_PERMISSIONS.viewer,
        scope: { jobAccess: "assigned", departments: [], regions: [] },
      }),
    ).toBe(true);
  });
});

describe("permission catalog and role editor", () => {
  it("shows every permission exactly once in the role editor, with no phantom keys", () => {
    const shown = PERMISSION_GROUPS.flatMap((group) =>
      group.permissions.map((permission) => permission.key),
    );
    expect(new Set(shown).size).toBe(shown.length);
    expect([...shown].sort()).toEqual([...PERMISSIONS].sort());
  });

  it("labels reject, delete and export separately", () => {
    const labels = Object.fromEntries(
      PERMISSION_GROUPS.flatMap((group) =>
        group.permissions.map((permission) => [permission.key, permission.label]),
      ),
    );
    expect(labels["candidates:reject"]).toBe("Reject candidates");
    expect(labels["candidates:delete"]).toBe("Delete candidates");
    expect(labels["candidates:export"]).toBe("Export candidate data");
    expect(labels["offers:decide"]).toBe("Record offer responses");
    expect(labels["offers:approve"]).toBe("Approve offers");
  });

  it("only gates settings sections on defined permissions", () => {
    for (const [path, gate] of Object.entries(SETTINGS_SECTION_PERMISSION)) {
      for (const permission of Array.isArray(gate) ? gate : [gate]) {
        expect(PERMISSIONS, `${path} -> ${permission}`).toContain(permission);
      }
    }
  });
});

describe("custom role migration 0166", () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "../../../../../packages/db/migrations");
  const sql = readFileSync(join(dir, "0166_role_permission_split.sql"), "utf8");

  it("adds each new permission to the roles that held the old one, and only once", () => {
    const rules: Array<[string, string[]]> = [
      ["candidates:reject", ["candidates:edit"]],
      ["offers:decide", ["offers:manage", "offers:approve"]],
      ["candidates:export", ["candidates:view"]],
    ];
    for (const [added, sources] of rules) {
      const statement = sql
        .split("--> statement-breakpoint")
        .find((part) => part.includes(`|| '["${added}"]'`));
      expect(statement, added).toBeDefined();
      for (const source of sources) {
        expect(statement).toContain(`'["${source}"]'`);
      }
      // Idempotent: a row that already has the new permission is skipped.
      expect(statement).toContain(`NOT "permissions" @> '["${added}"]'`);
      expect(statement).toContain(`jsonb_typeof("permissions") = 'array'`);
    }
  });

  it("only touches custom_roles and never removes a permission", () => {
    expect(sql).toContain('UPDATE "custom_roles"');
    expect(sql.match(/UPDATE "/g)?.length).toBe(3);
    expect(sql).not.toMatch(/DELETE|DROP|TRUNCATE|jsonb_set|- '\[/i);
  });

  it("is registered in the journal right after 0165", () => {
    const journal = JSON.parse(readFileSync(join(dir, "meta/_journal.json"), "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const entry = journal.entries.find((item) => item.tag === "0166_role_permission_split");
    expect(entry?.idx).toBe(166);
    expect(journal.entries.at(-1)?.tag).toBe("0166_role_permission_split");
  });
});
