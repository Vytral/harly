/**
 * Permission catalog , the single source of truth for what actions exist and
 * which roles may perform them. Client-safe (no server imports) so both the
 * enforcement layer and the UI matrix read from the same list.
 *
 * A permission key is `resource:action`. Roles (built-in or custom) own a set
 * of these keys. `owner` is unconditionally all-powerful; `admin` receives the
 * full explicit permission set (see `roleIsAllPowerful`).
 */

export const PERMISSIONS = [
  "jobs:create",
  "jobs:view",
  "jobs:edit",
  "jobs:delete",
  "jobs:publish",
  "jobs:approve",
  "hiring_team:manage",
  "candidates:view",
  "candidates:edit",
  "candidates:delete",
  "candidates:move",
  "dsar:manage",
  "collab:write", // notes, scorecards, schedule interviews, message
  "interviews:manage",
  "interviews:feedback",
  "tasks:read",
  "tasks:write",
  "offers:manage",
  "offers:approve",
  "templates:manage",
  "reports:read",
  "members:read",
  "members:invite",
  "members:edit",
  "members:remove",
  "invite_links:manage",
  "settings:edit",
  "integrations:manage",
  "roles:manage",
  "security:manage",
  "documents:read",
  "documents:manage",
  "documents:share",
  "automations:manage", // create / edit / toggle / delete workflows
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Tenant-local constraints layered on top of a role's permissions. Keeping
 * this separate from the permission key prevents a role matrix from exploding
 * into combinations such as `jobs:view:engineering:emea`.
 */
export type RoleScope = {
  jobAccess: "all" | "assigned";
  departments: string[];
  regions: string[];
};

export const unrestrictedRoleScope = (): RoleScope => ({
  jobAccess: "all",
  departments: [],
  regions: [],
});

export function normalizeRoleScope(raw: unknown): RoleScope {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return unrestrictedRoleScope();
  }

  const value = raw as Record<string, unknown>;
  const normalizeList = (input: unknown) =>
    Array.isArray(input)
      ? [...new Set(input.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
      : [];

  return {
    jobAccess: value.jobAccess === "assigned" ? "assigned" : "all",
    departments: normalizeList(value.departments),
    regions: normalizeList(value.regions),
  };
}

/** True when the target role would expose more tenant resources than the actor. */
export function scopeExceedsPrivilege(actor: RoleScope, target: RoleScope) {
  if (actor.jobAccess === "assigned" && target.jobAccess === "all") return true;
  const subset = (held: string[], requested: string[]) =>
    held.length > 0 &&
    (requested.length === 0 ||
      requested.some(
        (value) =>
          !held.some(
            (candidate) =>
              candidate.toLocaleLowerCase() === value.toLocaleLowerCase(),
          ),
      ));
  return (
    subset(actor.departments, target.departments) ||
    subset(actor.regions, target.regions)
  );
}

export type PermissionGroup = {
  label: string;
  permissions: { key: Permission; label: string; hint?: string }[];
};

/** Grouped for the role-editor matrix. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: "Jobs",
    permissions: [
      { key: "jobs:create", label: "Create jobs" },
      { key: "jobs:view", label: "View jobs" },
      { key: "jobs:edit", label: "Edit jobs" },
      { key: "jobs:delete", label: "Delete jobs", hint: "Move jobs to trash" },
      { key: "jobs:publish", label: "Publish jobs" },
      {
        key: "jobs:approve",
        label: "Approve jobs",
        hint: "Approve jobs before recruiting starts",
      },
      { key: "hiring_team:manage", label: "Manage hiring teams" },
    ],
  },
  {
    label: "Candidates",
    permissions: [
      { key: "candidates:edit", label: "Edit candidates" },
      { key: "candidates:view", label: "View candidates" },
      { key: "candidates:delete", label: "Delete / reject candidates" },
      { key: "candidates:move", label: "Move in pipeline" },
    ],
  },
  {
    label: "Privacy",
    permissions: [
      {
        key: "dsar:manage",
        label: "Review privacy requests",
        hint: "Approve or deny candidate data export and erasure requests",
      },
    ],
  },
  {
    label: "Collaboration",
    permissions: [
      {
        key: "collab:write",
        label: "Notes, evaluations & scheduling",
        hint: "Write notes, add scorecards, schedule interviews, email candidates",
      },
      { key: "interviews:manage", label: "Manage interviews" },
      { key: "interviews:feedback", label: "Submit interview feedback" },
      {
        key: "tasks:read",
        label: "View tasks",
      },
      {
        key: "tasks:write",
        label: "Create and manage tasks",
        hint: "Create, edit, assign, complete, and archive tasks",
      },
      {
        key: "offers:manage",
        label: "Manage offers",
        hint: "Create, send and decide job offers",
      },
      { key: "offers:approve", label: "Approve offers" },
      {
        key: "templates:manage",
        label: "Manage email templates",
      },
    ],
  },
  {
    label: "Documents",
    permissions: [
      { key: "documents:read", label: "View documents" },
      { key: "documents:manage", label: "Upload and manage documents" },
      {
        key: "documents:share",
        label: "Share documents",
        hint: "Change document access and member restrictions",
      },
    ],
  },
  {
    label: "Analytics",
    permissions: [
      {
        key: "reports:read",
        label: "View reports",
        hint: "View recruiting metrics, funnels, sources, and hiring trends",
      },
    ],
  },
  {
    label: "Administration",
    permissions: [
      { key: "members:read", label: "View members & invitations" },
      {
        key: "members:invite",
        label: "Invite members",
        hint: "Send invites, cancel invites, and add existing users",
      },
      { key: "members:edit", label: "Change member roles" },
      { key: "members:remove", label: "Remove members" },
      { key: "invite_links:manage", label: "Manage invite links" },
      { key: "settings:edit", label: "Edit workspace settings" },
      { key: "integrations:manage", label: "Manage integrations" },
      { key: "roles:manage", label: "Manage roles & permissions" },
      {
        key: "security:manage",
        label: "Manage workspace security",
        hint: "2FA enforcement, SSO, and security settings",
      },
    ],
  },
];

export const PERMISSION_LABELS: Record<Permission, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.key, p.label])),
) as Record<Permission, string>;

/** Built-in role keys (cannot be deleted; only `owner` is unconditionally all-powerful , `admin` gets the full explicit permission set). */
export const BUILTIN_ROLES = [
  "owner",
  "admin",
  "recruiter",
  "hiring_manager",
] as const;
export type BuiltinRole = (typeof BUILTIN_ROLES)[number];

/** Default permission sets for built-in roles. */
export const BUILTIN_ROLE_PERMISSIONS: Record<BuiltinRole, Permission[]> = {
  owner: [...PERMISSIONS],
  admin: [...PERMISSIONS],
  recruiter: [
    "jobs:create",
    "jobs:view",
    "jobs:edit",
    "jobs:publish",
    "hiring_team:manage",
    "candidates:view",
    "candidates:edit",
    "candidates:move",
    "collab:write",
    "interviews:manage",
    "interviews:feedback",
    "tasks:read",
    "tasks:write",
    "offers:manage",
    "templates:manage",
    "reports:read",
    "members:read",
    "dsar:manage",
    "documents:read",
    "documents:manage",
    "documents:share",
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
  ],
};

export function isBuiltinRole(role: string): role is BuiltinRole {
  return (BUILTIN_ROLES as readonly string[]).includes(role);
}

/**
 * Only the owner is unconditionally all-powerful and non-editable , the single
 * keyholder who can never be locked out. Every other role (admin included) runs
 * on its explicit permission set, so it can be tuned.
 */
export function roleIsAllPowerful(role: string): boolean {
  return role === "owner";
}

export function hasPermission(
  permissions: readonly string[],
  key: Permission,
): boolean {
  return permissions.includes(key);
}

/**
 * Privilege-ceiling check: true when `granted` contains any permission the
 * `actor` doesn't already hold , i.e. granting it would be an escalation.
 * The single source of truth used by every server guard that assigns a role
 * or edits a role's permission set. Client-safe and pure so it's unit-testable.
 */
export function exceedsPrivilege(
  actor: readonly string[],
  granted: readonly string[],
): boolean {
  const held = new Set(actor);
  return granted.some((p) => !held.has(p));
}

export function roleLabel(role: string): string {
  return role.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Which permission gates each settings section. Single source of truth shared
 * by the nav (to hide what you can't open) and each page (to redirect direct
 * URL access). Sections not listed here are open to any member.
 */
export const SETTINGS_SECTION_PERMISSION: Record<
  string,
  Permission | Permission[]
> = {
  "/settings": "settings:edit",
  "/settings/members": "members:read",
  "/settings/roles": "roles:manage",
  "/settings/ai": "settings:edit",
  "/settings/email": "settings:edit",
  "/settings/integrations": "integrations:manage",
  "/settings/developers": "integrations:manage",
  "/settings/security": "security:manage",
  "/settings/legal": ["settings:edit", "dsar:manage"],
  "/settings/portal": "settings:edit",
  "/settings/signature": "settings:edit",
};
