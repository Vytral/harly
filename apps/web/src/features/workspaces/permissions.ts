/**
 * Permission catalog — the single source of truth for what actions exist and
 * which roles may perform them. Client-safe (no server imports) so both the
 * enforcement layer and the UI matrix read from the same list.
 *
 * A permission key is `resource:action`. Roles (built-in or custom) own a set
 * of these keys. `owner` and `admin` are implicitly all-powerful.
 */

export const PERMISSIONS = [
  "jobs:create",
  "jobs:edit",
  "jobs:delete",
  "candidates:edit",
  "candidates:delete",
  "candidates:move",
  "collab:write", // notes, scorecards, schedule interviews, message
  "offers:manage",
  "templates:manage",
  "members:manage",
  "settings:edit",
  "integrations:manage",
  "roles:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

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
      { key: "jobs:edit", label: "Edit jobs" },
      { key: "jobs:delete", label: "Delete jobs", hint: "Move jobs to trash" },
    ],
  },
  {
    label: "Candidates",
    permissions: [
      { key: "candidates:edit", label: "Edit candidates" },
      { key: "candidates:delete", label: "Delete / reject candidates" },
      { key: "candidates:move", label: "Move in pipeline" },
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
      {
        key: "offers:manage",
        label: "Manage offers",
        hint: "Create, send and decide job offers",
      },
      {
        key: "templates:manage",
        label: "Manage email templates",
      },
    ],
  },
  {
    label: "Administration",
    permissions: [
      { key: "members:manage", label: "Manage members & invites" },
      { key: "settings:edit", label: "Edit workspace settings" },
      { key: "integrations:manage", label: "Manage integrations" },
      { key: "roles:manage", label: "Manage roles & permissions" },
    ],
  },
];

export const PERMISSION_LABELS: Record<Permission, string> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.key, p.label])),
) as Record<Permission, string>;

/** Built-in role keys (cannot be deleted; admins/owners are all-powerful). */
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
    "jobs:edit",
    "candidates:edit",
    "candidates:move",
    "collab:write",
    "offers:manage",
    "templates:manage",
  ],
  hiring_manager: ["candidates:move", "collab:write"],
};

export function isBuiltinRole(role: string): role is BuiltinRole {
  return (BUILTIN_ROLES as readonly string[]).includes(role);
}

/**
 * Only the owner is unconditionally all-powerful and non-editable — the single
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

export function roleLabel(role: string): string {
  return role.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
