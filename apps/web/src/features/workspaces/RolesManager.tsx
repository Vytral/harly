"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Pencil, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  createCustomRole,
  deleteCustomRole,
  updateCustomRole,
} from "@/features/workspaces/roles-actions";
import {
  PERMISSION_GROUPS,
  type Permission,
} from "@/features/workspaces/permissions";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";

export type RoleSummary = {
  key: string;
  name: string;
  permissions: Permission[];
  isBuiltin: boolean;
  isOwner: boolean;
  editable: boolean;
  memberCount: number;
};

const TOTAL_PERMISSIONS = PERMISSION_GROUPS.reduce(
  (n, g) => n + g.permissions.length,
  0,
);

export function RolesManager({ roles }: { roles: RoleSummary[] }) {
  const [editing, setEditing] = useState<RoleSummary | null>(null);

  return (
    <div className="space-y-2.5">
        {roles.map((role) => (
          <Card key={role.key}>
            <CardContent className="flex items-center justify-between gap-4 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-sage text-sage-ink">
                  {role.isOwner ? (
                    <Lock className="size-4" strokeWidth={1.8} />
                  ) : (
                    <Shield className="size-4" strokeWidth={1.8} />
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
                    {role.key === "owner" || role.key === "admin"
                      ? "Full access"
                      : `${role.permissions.length} of ${TOTAL_PERMISSIONS} permissions`}{" "}
                    · {role.memberCount}{" "}
                    {role.memberCount === 1 ? "member" : "members"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <Sheet
                  open={editing?.key === role.key}
                  onOpenChange={(o) => setEditing(o ? role : null)}
                >
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm">
                      {role.editable ? (
                        <>
                          <Pencil className="size-4" />
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
            </CardContent>
          </Card>
        ))}
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
    startSave(async () => {
      const result =
        mode === "create"
          ? await createCustomRole({ name, permissions })
          : await updateCustomRole({ key: role!.key, name, permissions });
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
      toast.success("Role deleted — members moved to Recruiter");
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
      description={
        readOnly
          ? "The Owner role always has full access and can't be changed."
          : role?.isBuiltin
            ? "Built-in role — tune its permissions. The name is fixed."
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
                {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Delete
              </Button>
            ) : null}
            <SheetClose asChild>
              <Button variant="outline" disabled={saving}>
                Cancel
              </Button>
            </SheetClose>
            <Button onClick={save} disabled={saving || name.trim().length < 2}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
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
                    className="flex items-start gap-3 rounded-lg border px-3 py-2.5"
                  >
                    <Checkbox
                      checked={selected.has(perm.key)}
                      disabled={readOnly}
                      onCheckedChange={(v) => toggle(perm.key, v === true)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{perm.label}</span>
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
