"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  cancelWorkspaceInvitationAction,
  inviteWorkspaceMemberAction,
  removeWorkspaceMemberAction,
  updateMemberRolesAction,
} from "@/features/workspaces/actions";
import type {
  WorkspaceInvitationItem,
  WorkspaceMemberItem,
} from "@/features/workspaces/data";
import { roleLabel } from "@/features/workspaces/permissions";
import {
  RoleEditor,
  RolesManager,
  type RoleSummary,
} from "@/features/workspaces/RolesManager";
import {
  CrownDuotoneIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckDuotoneIcon,
  TrashIcon,
  UserPlusIcon,
} from "@/components/ui/icons/phosphor";
import { EnvelopeIcon, UsersThreeIcon } from "@/components/ui/icons/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";

export type AssignableRole = { key: string; name: string };

const initialActionState = { success: false } as {
  success: boolean;
  error?: string;
};

function formatInvitationDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function useActionToast(
  state: { success: boolean; error?: string },
  successMessage: string,
) {
  const previous = useRef(state);
  useEffect(() => {
    if (state === previous.current) return;
    previous.current = state;
    if (state.success) toast.success(successMessage);
    else if (state.error) toast.error(state.error);
  }, [state, successMessage]);
}

export function MembersAndRoles({
  members,
  invitations,
  assignableRoles,
  roles,
  canManageMembers,
  canManageRoles,
}: {
  members: WorkspaceMemberItem[];
  invitations: WorkspaceInvitationItem[];
  assignableRoles: AssignableRole[];
  roles: RoleSummary[];
  canManageMembers: boolean;
  canManageRoles: boolean;
}) {
  const [creatingRole, setCreatingRole] = useState(false);
  const [tab, setTab] = useState("members");

  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList className="h-11 gap-1 rounded-xl bg-muted/70 p-1">
          <TabsTrigger
            value="members"
            className="gap-2 rounded-lg px-4 data-[state=active]:shadow-sm"
          >
            <UsersThreeIcon className="size-4" />
            Members
            <CountChip active={tab === "members"}>{members.length}</CountChip>
          </TabsTrigger>
          <TabsTrigger
            value="roles"
            className="gap-2 rounded-lg px-4 data-[state=active]:shadow-sm"
          >
            <ShieldCheckDuotoneIcon className="size-4" />
            Roles
            <CountChip active={tab === "roles"}>{roles.length}</CountChip>
          </TabsTrigger>
        </TabsList>

        {canManageRoles && tab === "roles" ? (
          <Sheet open={creatingRole} onOpenChange={setCreatingRole}>
            <SheetTrigger asChild>
              <Button>
                <PlusIcon className="size-4" />
                New role
              </Button>
            </SheetTrigger>
            <RoleEditor mode="create" onDone={() => setCreatingRole(false)} />
          </Sheet>
        ) : null}
      </div>

      <TabsContent value="members" className="space-y-6">
        <MembersPanel
          members={members}
          invitations={invitations}
          assignableRoles={assignableRoles}
          canManageMembers={canManageMembers}
        />
      </TabsContent>

      {canManageRoles ? (
        <TabsContent value="roles">
          <RolesManager roles={roles} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

// Back-compat alias — the page may import either name.
export const MembersSection = MembersAndRoles;

function CountChip({
  children,
  active,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
        active ? "bg-sage text-sage-ink" : "bg-foreground/10 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function MembersPanel({
  members,
  invitations,
  assignableRoles,
  canManageMembers,
}: {
  members: WorkspaceMemberItem[];
  invitations: WorkspaceInvitationItem[];
  assignableRoles: AssignableRole[];
  canManageMembers: boolean;
}) {
  const router = useRouter();
  const [inviteState, inviteAction, isInviting] = useActionState(
    inviteWorkspaceMemberAction,
    initialActionState,
  );
  useActionToast(inviteState, "Invitation sent.");

  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [saving, startSave] = useTransition();

  const roleName = (key: string) =>
    assignableRoles.find((r) => r.key === key)?.name ?? roleLabel(key);
  const draftFor = (m: WorkspaceMemberItem) => overrides[m.id] ?? m.role;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter((m) => {
        const matchesText =
          !q ||
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q);
        const matchesRole =
          roleFilter === "all" || (overrides[m.id] ?? m.role) === roleFilter;
        return matchesText && matchesRole;
      })
      .sort((a, b) => {
        const ao = a.role === "owner" ? 0 : 1;
        const bo = b.role === "owner" ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name);
      });
  }, [members, overrides, query, roleFilter]);

  const dirty = members.filter(
    (m) => overrides[m.id] !== undefined && overrides[m.id] !== m.role,
  );

  function saveChanges() {
    startSave(async () => {
      const result = await updateMemberRolesAction({
        changes: dirty.map((m) => ({ memberId: m.id, role: overrides[m.id] })),
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not save changes.");
        return;
      }
      toast.success(
        `Saved ${dirty.length} role ${dirty.length === 1 ? "change" : "changes"}`,
      );
      setOverrides({});
      router.refresh();
    });
  }

  const pendingInvitations = invitations.filter((i) => i.status === "pending");

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-full max-w-sm flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email…"
              className="pl-9"
            />
          </div>
          <p className="hidden shrink-0 text-xs text-muted-foreground/60 md:block">
            Showing {visible.length} member{visible.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {assignableRoles.map((r) => (
                <SelectItem key={r.key} value={r.key}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canManageMembers ? (
            <InviteSheet
              action={inviteAction}
              isInviting={isInviting}
              assignableRoles={assignableRoles}
            />
          ) : null}
        </div>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex items-center justify-between border-b bg-muted/20 px-5 py-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
            {visible.length} {visible.length === 1 ? "member" : "members"}
          </p>
          <p className="hidden text-xs font-medium uppercase tracking-wide text-muted-foreground/70 sm:block">
            Role
          </p>
        </div>
        <CardContent className="p-0">
          <ul className="divide-y">
            {visible.map((member) => {
              const isLockedOwner =
                member.isCurrentUser && member.role === "owner";
              const draft = draftFor(member);
              const changed = draft !== member.role;
              return (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/20"
                >
                  <UserAvatar name={member.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span className="truncate">{member.name}</span>
                      {member.role === "owner" ? (
                        <CrownDuotoneIcon className="size-4 shrink-0 text-clay" />
                      ) : null}
                      {member.isCurrentUser ? (
                        <Badge variant="secondary" className="shrink-0">
                          You
                        </Badge>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  </div>

                  {!canManageMembers || isLockedOwner ? (
                    <Badge variant="outline">{roleName(member.role)}</Badge>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Select
                        value={draft}
                        onValueChange={(value) =>
                          setOverrides((prev) => ({
                            ...prev,
                            [member.id]: value,
                          }))
                        }
                      >
                        <SelectTrigger
                          className={
                            changed
                              ? "w-40 border-pine/50 bg-sage/40"
                              : "w-40"
                          }
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {assignableRoles.map((r) => (
                            <SelectItem key={r.key} value={r.key}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!member.isCurrentUser ? (
                        <RemoveMemberButton
                          memberId={member.id}
                          name={member.name}
                        />
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
            {visible.length === 0 ? (
              <li className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                  <UsersThreeIcon className="size-5" />
                </span>
                <p className="text-sm font-medium">No members match</p>
                <p className="text-xs text-muted-foreground">
                  Try a different search or role filter.
                </p>
              </li>
            ) : null}
          </ul>
        </CardContent>
      </Card>

      {pendingInvitations.length > 0 ? (
        <div className="space-y-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pending invitations
          </p>
          <Card className="gap-0 overflow-hidden py-0">
            <ul className="divide-y">
              {pendingInvitations.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-5 py-3.5"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <EnvelopeIcon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {roleName(item.role)} · expires{" "}
                        {formatInvitationDate(item.expiresAt)}
                      </p>
                    </div>
                  </div>
                  {canManageMembers ? (
                    <CancelInvitationButton invitationId={item.id} />
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {canManageMembers && dirty.length > 0 ? (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-2xl border border-pine/30 bg-card px-4 py-3 shadow-[0_8px_24px_-12px_rgba(31,41,38,0.25)]">
          <p className="text-sm">
            <span className="font-medium">{dirty.length}</span> unsaved role{" "}
            {dirty.length === 1 ? "change" : "changes"}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => setOverrides({})}
            >
              Discard
            </Button>
            <Button size="sm" disabled={saving} onClick={saveChanges}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InviteSheet({
  action,
  isInviting,
  assignableRoles,
}: {
  action: (formData: FormData) => void;
  isInviting: boolean;
  assignableRoles: AssignableRole[];
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button>
          <UserPlusIcon className="size-4" />
          Invite
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4 text-left">
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">
            Invite a teammate
          </SheetTitle>
          <SheetDescription className="mt-1 text-sm text-muted-foreground">
            They&apos;ll get an email to join this workspace.
          </SheetDescription>
        </SheetHeader>
        <form action={action} className="flex-1 space-y-5 px-5 py-5">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              placeholder="teammate@company.com"
              disabled={isInviting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select name="role" defaultValue="recruiter">
              <SelectTrigger id="invite-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {assignableRoles.map((r) => (
                  <SelectItem key={r.key} value={r.key}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={isInviting} className="w-full">
            <UserPlusIcon className="size-4" />
            {isInviting ? "Inviting…" : "Send invite"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function RemoveMemberButton({
  memberId,
  name,
}: {
  memberId: string;
  name: string;
}) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    removeWorkspaceMemberAction,
    initialActionState,
  );
  const previous = useRef(state);
  useEffect(() => {
    if (state === previous.current) return;
    previous.current = state;
    if (state.success) {
      toast.success("Member removed.");
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form action={formAction}>
      <input type="hidden" name="memberId" value={memberId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive"
        disabled={isPending}
        aria-label={`Remove ${name}`}
      >
        <TrashIcon className="size-4" />
      </Button>
    </form>
  );
}

function CancelInvitationButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await cancelWorkspaceInvitationAction(invitationId);
          if (result.success) {
            toast.success("Invitation canceled.");
            router.refresh();
          } else {
            toast.error(result.error ?? "Unable to cancel invitation.");
          }
        });
      }}
    >
      {isPending ? "Canceling…" : "Cancel"}
    </Button>
  );
}
