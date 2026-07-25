"use client";

import {
  useMemo,
  useState,
  useTransition,
  type ComponentType,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  cancelWorkspaceInvitationAction,
  createMemberAction,
  editMemberProfileAction,
  removeWorkspaceMemberAction,
  resendWorkspaceInvitationAction,
  setMemberPasswordAction,
  updateMemberRolesAction,
} from "@/features/workspaces/actions";
import {
  generateMemberSenderIdentityAction,
  updateMemberSenderIdentityAction,
} from "@/features/workspaces/sender-identity-actions";
import type {
  WorkspaceEmailIdentityStatus,
  WorkspaceInvitationItem,
  WorkspaceMemberItem,
} from "@/features/workspaces/data";
import {
  InviteTeammatesSheet,
  type InviteLinkState,
} from "@/features/workspaces/InviteTeammatesSheet";
import { InviteLinkButton } from "@/features/workspaces/InviteLinkButton";
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
  GearSixIcon,
  KeyDuotoneIcon,
  ArrowsClockwiseIcon,
  CopyIcon,
  DotsThreeVerticalIcon,
} from "@/components/ui/icons/phosphor";
import { EnvelopeIcon, UsersThreeIcon } from "@/components/ui/icons/settings";
import { GithubIcon } from "@/components/ui/icons/GithubIcon";
import { LinkedinLogo } from "@/components/ui/icons/brands";
import { GlobeIcon, PencilIcon } from "@/components/ui/icons/phosphor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileDropzone } from "@/components/ui/FileDropzone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetClose, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DrawerLayout } from "@/features/candidates/DrawerLayout";
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

export function MembersAndRoles({
  members,
  invitations,
  assignableRoles,
  inviteLink,
  roles,
  canInviteMembers,
  canEditMembers,
  canRemoveMembers,
  canManageInviteLinks,
  canManageRoles,
  canManageMemberAccounts,
  emailIdentity,
}: {
  members: WorkspaceMemberItem[];
  invitations: WorkspaceInvitationItem[];
  assignableRoles: AssignableRole[];
  inviteLink: InviteLinkState;
  roles: RoleSummary[];
  canInviteMembers: boolean;
  canEditMembers: boolean;
  canRemoveMembers: boolean;
  canManageInviteLinks: boolean;
  canManageRoles: boolean;
  canManageMemberAccounts: boolean;
  emailIdentity: WorkspaceEmailIdentityStatus;
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
          {canManageRoles ? (
            <TabsTrigger
              value="roles"
              className="gap-2 rounded-lg px-4 data-[state=active]:shadow-sm"
            >
              <ShieldCheckDuotoneIcon className="size-4" />
              Roles
              <CountChip active={tab === "roles"}>{roles.length}</CountChip>
            </TabsTrigger>
          ) : null}
        </TabsList>

        {canManageRoles && tab === "roles" ? (
          <Sheet open={creatingRole} onOpenChange={setCreatingRole} mobilePresentation="bottom-on-mobile">
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
          inviteLink={inviteLink}
          canInviteMembers={canInviteMembers}
          canEditMembers={canEditMembers}
          canRemoveMembers={canRemoveMembers}
          canManageInviteLinks={canManageInviteLinks}
          canManageMemberAccounts={canManageMemberAccounts}
          emailIdentity={emailIdentity}
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

// Back-compat alias , the page may import either name.
export const MembersSection = MembersAndRoles;

function SocialLinkField({
  icon: Icon,
  label,
  placeholder,
  id,
  value,
  onChange,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  placeholder: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50">
          <Icon className="size-4" />
        </span>
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pl-9 text-sm"
        />
      </div>
    </div>
  );
}

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
  inviteLink,
  canInviteMembers,
  canEditMembers,
  canRemoveMembers,
  canManageInviteLinks,
  canManageMemberAccounts,
  emailIdentity,
}: {
  members: WorkspaceMemberItem[];
  invitations: WorkspaceInvitationItem[];
  assignableRoles: AssignableRole[];
  inviteLink: InviteLinkState;
  canInviteMembers: boolean;
  canEditMembers: boolean;
  canRemoveMembers: boolean;
  canManageInviteLinks: boolean;
  canManageMemberAccounts: boolean;
  emailIdentity: WorkspaceEmailIdentityStatus;
}) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [saving, startSave] = useTransition();
  const [editingIdentity, setEditingIdentity] = useState<WorkspaceMemberItem | null>(
    null,
  );

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
          <p className="hidden shrink-0 text-xs text-muted-foreground md:block">
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
          {canInviteMembers || canManageInviteLinks ? (
            <>
              {canManageInviteLinks ? (
                <InviteLinkButton
                  inviteLink={inviteLink}
                  assignableRoles={assignableRoles}
                />
              ) : null}
              {canManageMemberAccounts ? (
                <CreateMemberButton assignableRoles={assignableRoles} />
              ) : null}
              {canInviteMembers ? (
                <InviteTeammatesSheet
                  assignableRoles={assignableRoles}
                  pendingInvitations={invitations}
                  trigger={
                    <Button>
                      <UserPlusIcon className="size-4" />
                      Invite
                    </Button>
                  }
                />
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex items-center justify-between border-b bg-muted/20 px-5 py-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {visible.length} {visible.length === 1 ? "member" : "members"}
          </p>
          <p className="hidden text-xs font-medium uppercase tracking-wide text-muted-foreground sm:block">
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
                  <UserAvatar name={member.name} src={member.image} size="sm" />
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
                    {emailIdentity.enabled ? (
                      member.senderLocalPart ? (
                        <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                          <span className="truncate">
                            {member.senderLocalPart}@{emailIdentity.domain}
                          </span>
                          {canManageMemberAccounts ? (
                            <button
                              type="button"
                              onClick={() => setEditingIdentity(member)}
                              className="shrink-0 text-muted-foreground/70 hover:text-foreground"
                              title="Edit sender address"
                            >
                              <PencilIcon className="size-3" />
                            </button>
                          ) : null}
                        </p>
                      ) : canManageMemberAccounts ? (
                        <button
                          type="button"
                          onClick={() =>
                            startSave(async () => {
                              const result = await generateMemberSenderIdentityAction({
                                memberId: member.id,
                              });
                              if (!result.success) {
                                toast.error(
                                  result.error ?? "Could not generate a sender address.",
                                );
                                return;
                              }
                              router.refresh();
                            })
                          }
                          className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                        >
                          Not set — generate
                        </button>
                      ) : null
                    ) : null}
                  </div>

                  {!canEditMembers || isLockedOwner ? (
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
                      {!member.isCurrentUser &&
                      (canManageMemberAccounts || canRemoveMembers) ? (
                        <MemberRowActions
                          member={member}
                          canManageMemberAccounts={canManageMemberAccounts}
                          canRemoveMembers={canRemoveMembers}
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
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        <span className="truncate">{item.email}</span>
                        <Badge variant="warning" className="shrink-0">
                          Invited
                        </Badge>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {roleName(item.role)} · expires{" "}
                        {formatInvitationDate(item.expiresAt)}
                      </p>
                    </div>
                  </div>
                  {canInviteMembers ? (
                    <div className="flex items-center gap-2">
                      <ResendInvitationButton invitationId={item.id} />
                      <CancelInvitationButton invitationId={item.id} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {canEditMembers && dirty.length > 0 ? (
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

      <SenderIdentityDialog
        member={editingIdentity}
        onClose={() => setEditingIdentity(null)}
        onSaved={() => {
          setEditingIdentity(null);
          router.refresh();
        }}
      />
    </div>
  );
}

// Owner-only edit of a recruiter's virtual sender local-part/display name.
function SenderIdentityDialog({
  member,
  onClose,
  onSaved,
}: {
  member: WorkspaceMemberItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [localPart, setLocalPart] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, startSaving] = useTransition();

  const open = member !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {member ? (
        <DialogContent
          key={member.id}
          onOpenAutoFocus={() => {
            setLocalPart(member.senderLocalPart ?? "");
            setDisplayName(member.senderDisplayName ?? member.name);
          }}
        >
          <DialogHeader>
            <DialogTitle>Sender address for {member.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sender-local-part" className="text-xs text-muted-foreground">
                Local-part
              </Label>
              <Input
                id="sender-local-part"
                value={localPart}
                onChange={(e) => setLocalPart(e.target.value)}
                placeholder="benjamin.gonzalez"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sender-display-name" className="text-xs text-muted-foreground">
                Display name
              </Label>
              <Input
                id="sender-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={member.name}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              disabled={saving}
              onClick={() =>
                startSaving(async () => {
                  const result = await updateMemberSenderIdentityAction({
                    memberId: member.id,
                    localPart,
                    displayName,
                  });
                  if (!result.success) {
                    toast.error(result.error ?? "Could not update the sender address.");
                    return;
                  }
                  toast.success("Sender address updated.");
                  onSaved();
                })
              }
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

// Per-row overflow menu. Collapses "manage account" and "remove" behind a
// single ⋮ so neither is a one-click accident, and gates removal on a confirm.
function MemberRowActions({
  member,
  canManageMemberAccounts,
  canRemoveMembers,
}: {
  member: WorkspaceMemberItem;
  canManageMemberAccounts: boolean;
  canRemoveMembers: boolean;
}) {
  const [manageOpen, setManageOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            aria-label={`Actions for ${member.name}`}
          >
            <DotsThreeVerticalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {canManageMemberAccounts ? (
            <DropdownMenuItem onSelect={() => setManageOpen(true)}>
              <GearSixIcon className="size-4" />
              Manage account
            </DropdownMenuItem>
          ) : null}
          {canManageMemberAccounts && canRemoveMembers ? (
            <DropdownMenuSeparator />
          ) : null}
          {canRemoveMembers ? (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirmOpen(true)}
            >
              <TrashIcon className="size-4" />
              Remove
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {canManageMemberAccounts ? (
        <ManageMemberAccountSheet
          member={member}
          open={manageOpen}
          onOpenChange={setManageOpen}
        />
      ) : null}
      {canRemoveMembers ? (
        <RemoveMemberDialog
          member={member}
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
        />
      ) : null}
    </>
  );
}

function RemoveMemberDialog({
  member,
  open,
  onOpenChange,
}: {
  member: WorkspaceMemberItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("memberId", member.id);
      const result = await removeWorkspaceMemberAction(initialActionState, fd);
      if (!result.success) {
        toast.error(result.error ?? "Unable to remove member.");
        return;
      }
      onOpenChange(false);
      toast.success(`${member.name} removed.`);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {member.name}?</DialogTitle>
          <DialogDescription>
            {member.name} ({member.email}) loses access to this workspace
            immediately. Their candidate notes and activity stay. You can invite
            them back later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={remove} disabled={isPending}>
            {isPending ? "Removing…" : "Remove member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResendInvitationButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await resendWorkspaceInvitationAction(invitationId);
          if (result.success) {
            toast.success("Invitation resent.");
            router.refresh();
          } else {
            toast.error(result.error ?? "Unable to resend invitation.");
          }
        });
      }}
    >
      {isPending ? "Sending…" : "Resend"}
    </Button>
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

// ─── Owner-only: reset password / edit a teammate's profile ──────────────────

function ManageMemberAccountSheet({
  member,
  open,
  onOpenChange,
}: {
  member: WorkspaceMemberItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} mobilePresentation="bottom-on-mobile">
      <DrawerLayout
        title={`Manage ${member.name}`}
        className="sm:max-w-lg"
        description="Update this member's profile or reset their password. Changes take effect immediately."
      >
        <Tabs defaultValue="profile" className="gap-5">
          <TabsList className="w-full">
            <TabsTrigger value="profile" className="flex-1 gap-2">
              <GearSixIcon className="size-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="password" className="flex-1 gap-2">
              <KeyDuotoneIcon className="size-4" />
              Password
            </TabsTrigger>
          </TabsList>
          <TabsContent value="profile">
            <EditMemberProfileForm
              member={member}
              onDone={() => onOpenChange(false)}
            />
          </TabsContent>
          <TabsContent value="password">
            <ResetMemberPasswordForm
              member={member}
              onDone={() => onOpenChange(false)}
            />
          </TabsContent>
        </Tabs>
      </DrawerLayout>
    </Sheet>
  );
}

function EditMemberProfileForm({
  member,
  onDone,
}: {
  member: WorkspaceMemberItem;
  onDone: () => void;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [form, setForm] = useState({
    name: member.name,
    email: member.email,
    jobTitle: member.jobTitle ?? "",
    phone: member.phone ?? "",
    location: member.location ?? "",
    bio: member.bio ?? "",
    linkedinUrl: member.linkedinUrl ?? "",
    githubUrl: member.githubUrl ?? "",
    websiteUrl: member.websiteUrl ?? "",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function submit() {
    startSave(async () => {
      const result = await editMemberProfileAction({
        memberId: member.id,
        ...form,
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not update profile.");
        return;
      }
      toast.success("Profile updated.");
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mm-name">Name</Label>
          <Input
            id="mm-name"
            value={form.name}
            onChange={(e) => set("name")(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mm-email">Login email</Label>
          <Input
            id="mm-email"
            type="email"
            value={form.email}
            onChange={(e) => set("email")(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mm-title">Job title</Label>
          <Input
            id="mm-title"
            value={form.jobTitle}
            onChange={(e) => set("jobTitle")(e.target.value)}
            placeholder="Technical Recruiter"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mm-phone">Phone</Label>
          <Input
            id="mm-phone"
            value={form.phone}
            onChange={(e) => set("phone")(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mm-location">Location</Label>
        <Input
          id="mm-location"
          value={form.location}
          onChange={(e) => set("location")(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mm-bio">Bio</Label>
        <Textarea
          id="mm-bio"
          value={form.bio}
          onChange={(e) => set("bio")(e.target.value)}
          rows={3}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SocialLinkField
          id="mm-linkedin"
          icon={LinkedinLogo}
          label="LinkedIn"
          placeholder="https://linkedin.com/in/username"
          value={form.linkedinUrl}
          onChange={set("linkedinUrl")}
        />
        <SocialLinkField
          id="mm-github"
          icon={GithubIcon}
          label="GitHub"
          placeholder="https://github.com/username"
          value={form.githubUrl}
          onChange={set("githubUrl")}
        />
        <SocialLinkField
          id="mm-website"
          icon={GlobeIcon}
          label="Website"
          placeholder="https://yoursite.com"
          value={form.websiteUrl}
          onChange={set("websiteUrl")}
        />
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <SheetClose asChild>
          <Button variant="ghost" disabled={saving}>
            Cancel
          </Button>
        </SheetClose>
        <Button onClick={submit} disabled={saving || !form.name || !form.email}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </div>
  );
}

function ResetMemberPasswordForm({
  member,
  onDone,
}: {
  member: WorkspaceMemberItem;
  onDone: () => void;
}) {
  const [saving, startSave] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 8;

  function submit() {
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    startSave(async () => {
      const result = await setMemberPasswordAction({
        memberId: member.id,
        password,
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not reset password.");
        return;
      }
      toast.success(`Password reset. ${member.name} must sign in again.`);
      setPassword("");
      setConfirm("");
      onDone();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-clay/25 bg-clay/5 px-3 py-2.5 text-xs text-muted-foreground">
        Setting a new password signs {member.name} out of all sessions. Share
        the new password with them over a secure channel.
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="mm-pw">New password</Label>
        <Input
          id="mm-pw"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        {tooShort ? (
          <p className="text-xs text-destructive">
            Use at least 8 characters.
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="mm-pw2">Confirm password</Label>
        <Input
          id="mm-pw2"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        {mismatch ? (
          <p className="text-xs text-destructive">Passwords do not match.</p>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <SheetClose asChild>
          <Button variant="ghost" disabled={saving}>
            Cancel
          </Button>
        </SheetClose>
        <Button
          variant="destructive"
          onClick={submit}
          disabled={saving || password.length < 8 || password !== confirm}
        >
          {saving ? "Resetting…" : "Reset password"}
        </Button>
      </div>
    </div>
  );
}

// ─── Owner-only: create a member account directly (no invite email) ──────────

function generatePassword(): string {
  // Readable but strong: 16 chars from a set without ambiguous glyphs.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function CreateMemberButton({
  assignableRoles,
}: {
  assignableRoles: AssignableRole[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen} mobilePresentation="bottom-on-mobile">
      <SheetTrigger asChild>
        <Button variant="outline">
          <PlusIcon className="size-4" />
          Create member
        </Button>
      </SheetTrigger>
      <DrawerLayout
        title="Create a member"
        className="sm:max-w-lg"
        description="Provision an account directly. The member signs in with the password you set, then must choose a new one."
      >
        <CreateMemberForm
          assignableRoles={assignableRoles}
          onDone={() => setOpen(false)}
        />
      </DrawerLayout>
    </Sheet>
  );
}

function CreateMemberForm({
  assignableRoles,
  onDone,
}: {
  assignableRoles: AssignableRole[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const assignable = assignableRoles.filter((r) => r.key !== "owner");
  const [form, setForm] = useState({
    name: "",
    email: "",
    role:
      assignable.find((r) => r.key === "recruiter")?.key ??
      assignable[0]?.key ??
      "recruiter",
    jobTitle: "",
    image: "",
    password: generatePassword(),
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function copyPassword() {
    navigator.clipboard.writeText(form.password);
    toast.success("Password copied");
  }

  function submit() {
    startSave(async () => {
      const result = await createMemberAction({
        name: form.name,
        email: form.email,
        role: form.role,
        password: form.password,
        image: form.image || undefined,
        jobTitle: form.jobTitle || undefined,
      });
      if (!result.success) {
        toast.error(result.error ?? "Could not create member.");
        return;
      }
      toast.success(`${form.name} added. Share their password securely.`);
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <FileDropzone
          value={form.image || null}
          onChange={(url) => set("image")(url ?? "")}
          variant="avatar"
          hint="Photo · optional"
        />
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="cm-name">Full name</Label>
          <Input
            id="cm-name"
            value={form.name}
            onChange={(e) => set("name")(e.target.value)}
            placeholder="Jordan Rivera"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cm-email">Login email</Label>
          <Input
            id="cm-email"
            type="email"
            value={form.email}
            onChange={(e) => set("email")(e.target.value)}
            placeholder="jordan@company.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cm-role">Role</Label>
          <Select value={form.role} onValueChange={set("role")}>
            <SelectTrigger id="cm-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {assignable.map((r) => (
                <SelectItem key={r.key} value={r.key}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cm-title">Job title</Label>
        <Input
          id="cm-title"
          value={form.jobTitle}
          onChange={(e) => set("jobTitle")(e.target.value)}
          placeholder="Technical Recruiter"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cm-pw">Temporary password</Label>
        <div className="flex gap-2">
          <Input
            id="cm-pw"
            value={form.password}
            onChange={(e) => set("password")(e.target.value)}
            className="font-mono"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => set("password")(generatePassword())}
            aria-label="Regenerate password"
          >
            <ArrowsClockwiseIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={copyPassword}
            aria-label="Copy password"
          >
            <CopyIcon className="size-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          The member is forced to set their own password on first sign-in.
        </p>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <SheetClose asChild>
          <Button variant="ghost" disabled={saving}>
            Cancel
          </Button>
        </SheetClose>
        <Button
          onClick={submit}
          disabled={
            saving || !form.name || !form.email || form.password.length < 8
          }
        >
          {saving ? "Creating…" : "Create member"}
        </Button>
      </div>
    </div>
  );
}
