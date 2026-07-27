"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  createCustomRole,
  deleteCustomRole,
  updateCustomRole,
} from "@/features/workspaces/roles-actions";
import {
  PERMISSION_GROUPS,
  type RoleScope,
  type Permission,
} from "@/features/workspaces/permissions";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import {
  LockDuotoneIcon,
  PencilIcon,
  ShieldCheckDuotoneIcon,
  SpinnerIcon,
  TrashIcon,
} from "@/components/ui/icons/phosphor";
import { AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";

export type RoleSummary = {
  key: string;
  name: string;
  permissions: Permission[];
  scope: RoleScope;
  isBuiltin: boolean;
  isOwner: boolean;
  editable: boolean;
  memberCount: number;
  members: {
    id: string;
    name: string;
    image?: string | null;
  }[];
};

const TOTAL_PERMISSIONS = PERMISSION_GROUPS.reduce(
  (n, g) => n + g.permissions.length,
  0,
);

export function RolesManager({ roles }: { roles: RoleSummary[] }) {
  const [editing, setEditing] = useState<RoleSummary | null>(null);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {roles.map((role) => {
        const fullAccess = role.key === "owner" || role.key === "admin";
        const pct = fullAccess
          ? 100
          : Math.round((role.permissions.length / TOTAL_PERMISSIONS) * 100);

        return (
          <Card key={role.key} className="gap-0 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sage text-pine ring-1 ring-pine/10">
                  {role.isOwner ? (
                    <LockDuotoneIcon className="size-5" />
                  ) : (
                    <ShieldCheckDuotoneIcon className="size-5" />
                  )}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{role.name}</p>
                    <Badge variant={role.isBuiltin ? "secondary" : "outline"}>
                      {role.isBuiltin ? "Built-in" : "Custom"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {role.memberCount}{" "}
                    {role.memberCount === 1 ? "member" : "members"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Sheet
                  open={editing?.key === role.key}
                  onOpenChange={(o) => setEditing(o ? role : null)}
                  mobilePresentation="bottom-on-mobile"
                >
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm">
                      {role.editable ? (
                        <>
                          <PencilIcon className="size-4" />
                          Edit
                        </>
                      ) : (
                        "View"
                      )}
                    </Button>
                  </SheetTrigger>
                  <RoleEditor
                    mode={role.editable ? "edit" : "view"}
                    role={role}
                    onDone={() => setEditing(null)}
                  />
                </Sheet>
              </div>
            </div>

            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Permissions</span>
                <span className="font-medium tabular-nums">
                  {fullAccess
                    ? "Full access"
                    : `${role.permissions.length} / ${TOTAL_PERMISSIONS}`}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    fullAccess ? "bg-pine" : "bg-pine/70",
                  )}
                  style={{ width: `${Math.max(pct, 4)}%` }}
                />
              </div>
            </div>

            {role.scope.jobAccess === "assigned" ||
            role.scope.departments.length > 0 ||
            role.scope.regions.length > 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Scoped to {role.scope.jobAccess === "assigned" ? "assigned jobs" : "selected filters"}
                {role.scope.departments.length > 0
                  ? ` · ${role.scope.departments.length} department${role.scope.departments.length === 1 ? "" : "s"}`
                  : ""}
                {role.scope.regions.length > 0
                  ? ` · ${role.scope.regions.length} region${role.scope.regions.length === 1 ? "" : "s"}`
                  : ""}
              </p>
            ) : null}

            {role.members.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Members with this role
                </p>
                <AvatarGroup>
                  {role.members.slice(0, 5).map((member) => (
                    <UserAvatar
                      key={member.id}
                      name={member.name}
                      src={member.image}
                      size="sm"
                      className="ring-2 ring-background"
                    />
                  ))}
                  {role.members.length > 5 && (
                    <AvatarGroupCount>
                      +{role.members.length - 5}
                    </AvatarGroupCount>
                  )}
                </AvatarGroup>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export function RoleEditor({
  mode,
  role,
  onDone,
}: {
  mode: "create" | "edit" | "view";
  role?: RoleSummary;
  onDone: () => void;
}) {
  const router = useRouter();
  const readOnly = mode === "view";
  const [name, setName] = useState(role?.name ?? "");
  const [selected, setSelected] = useState<Set<Permission>>(
    new Set(role?.permissions ?? []),
  );
  const [jobAccess, setJobAccess] = useState<RoleScope["jobAccess"]>(
    role?.scope.jobAccess ?? "all",
  );
  const [departments, setDepartments] = useState(
    role?.scope.departments.join(", ") ?? "",
  );
  const [regions, setRegions] = useState(role?.scope.regions.join(", ") ?? "");
  const [saving, startSave] = useTransition();
  const [deleting, startDelete] = useTransition();

  function toggle(key: Permission, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function save() {
    const permissions = [...selected];
    const scope = {
      jobAccess,
      departments: departments.split(",").map((value) => value.trim()).filter(Boolean),
      regions: regions.split(",").map((value) => value.trim()).filter(Boolean),
    } satisfies RoleScope;
    startSave(async () => {
      const result =
        mode === "create"
          ? await createCustomRole({ name, permissions, scope })
          : await updateCustomRole({ key: role!.key, name, permissions, scope });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save role.");
        return;
      }
      toast.success(mode === "create" ? "Role created" : "Role updated");
      onDone();
      router.refresh();
    });
  }

  function remove() {
    if (!role) return;
    startDelete(async () => {
      const result = await deleteCustomRole({ key: role.key });
      if (!result.ok) {
        toast.error(result.error ?? "Could not delete role.");
        return;
      }
      toast.success("Role deleted. Members moved to Recruiter");
      onDone();
      router.refresh();
    });
  }

  const title =
    mode === "create"
      ? "New role"
      : mode === "view"
        ? role?.name ?? "Role"
        : `Edit ${role?.name ?? "role"}`;

  return (
    <DrawerLayout
      title={title}
      className="sm:max-w-2xl"
      description={
        readOnly
          ? "The Owner role always has full access and can't be changed."
          : role?.isBuiltin
            ? "Built-in role. Tune its permissions. The name is fixed."
            : "Pick a name and the permissions this role grants."
      }
      footer={
        readOnly ? (
          <SheetClose asChild>
            <Button variant="outline">Close</Button>
          </SheetClose>
        ) : (
          <>
            {mode === "edit" && role && !role.isBuiltin ? (
              <Button
                variant="ghost"
                className="mr-auto text-destructive hover:text-destructive"
                disabled={deleting || saving}
                onClick={remove}
              >
                {deleting ? (
                  <SpinnerIcon className="size-4" />
                ) : (
                  <TrashIcon className="size-4" />
                )}
                Delete
              </Button>
            ) : null}
            <SheetClose asChild>
              <Button variant="outline" disabled={saving}>
                Cancel
              </Button>
            </SheetClose>
            <Button onClick={save} disabled={saving || name.trim().length < 2}>
              {saving ? <SpinnerIcon className="size-4" /> : null}
              Save
            </Button>
          </>
        )
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="role-name">Role name</Label>
          <Input
            id="role-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sourcer"
            disabled={readOnly || Boolean(role?.isBuiltin)}
          />
        </div>

        <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
          <div>
            <p className="text-sm font-medium">Access scope</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Limit this role to assigned jobs, departments, or regions. Empty filters mean unrestricted access.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="role-job-access">Jobs</Label>
              <Select value={jobAccess} onValueChange={(value) => setJobAccess(value as RoleScope["jobAccess"])} disabled={readOnly}>
                <SelectTrigger id="role-job-access"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All matching jobs</SelectItem>
                  <SelectItem value="assigned">Assigned jobs only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-departments">Departments</Label>
              <Input id="role-departments" value={departments} onChange={(e) => setDepartments(e.target.value)} placeholder="Engineering, Sales" disabled={readOnly} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-regions">Regions</Label>
              <Input id="role-regions" value={regions} onChange={(e) => setRegions(e.target.value)} placeholder="LATAM, EMEA" disabled={readOnly} />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.label} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <div className="space-y-1.5">
                {group.permissions.map((perm) => (
                  <label
                    key={perm.key}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                      !readOnly && "hover:border-foreground/15",
                      selected.has(perm.key) && "border-pine/30 bg-sage/30",
                    )}
                  >
                    <Checkbox
                      checked={selected.has(perm.key)}
                      disabled={readOnly}
                      onCheckedChange={(v) => toggle(perm.key, v === true)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {perm.label}
                      </span>
                      {perm.hint ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {perm.hint}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </DrawerLayout>
  );
}
