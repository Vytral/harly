import { MembersAndRoles } from "@/features/workspaces/MembersSection";
import { getWorkspaceSettingsData } from "@/features/workspaces/data";
import {
  can,
  listWorkspaceRoles,
  requirePagePermission,
} from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

export default async function MembersSettingsPage() {
  await requirePagePermission("members:read");
  const [{ members, invitations, inviteLink }, roles, canInvite, canEditMembers, canRemoveMembers, canManageInviteLinks, canRoles] =
    await Promise.all([
      getWorkspaceSettingsData(),
      listWorkspaceRoles(),
      can("members:invite"),
      can("members:edit"),
      can("members:remove"),
      can("invite_links:manage"),
      can("roles:manage"),
    ]);

  const assignableRoles = roles.map((role) => ({
    key: role.key,
    name: role.name,
  }));

  return (
    <MembersAndRoles
      members={members}
      invitations={invitations}
      assignableRoles={assignableRoles}
      inviteLink={inviteLink}
      roles={roles}
      canInviteMembers={canInvite}
      canEditMembers={canEditMembers}
      canRemoveMembers={canRemoveMembers}
      canManageInviteLinks={canManageInviteLinks}
      canManageRoles={canRoles}
    />
  );
}
