import { UserRound } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { PageTitleRow } from "@/features/candidates/directory-chrome";
import { listPeopleAction } from "@/features/people/actions";
import { PeopleTable, type PersonListRow } from "@/features/people/PeopleTable";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  await requirePagePermission("members:read");
  const rows = await listPeopleAction();

  const people: PersonListRow[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    image: row.image,
    jobTitle: row.jobTitle,
    username: row.username,
    timezone: row.timezone,
    specialties: row.specialties ?? [],
    role: row.role,
  }));

  return (
    <div className="space-y-6">
      <PageTitleRow
        title="Team"
        description="Everyone on the team, with contact details, specialties, and availability."
      />

      {people.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="No teammates yet"
          description="Invite people from Settings → Members to see them here."
        />
      ) : (
        <PeopleTable rows={people} />
      )}
    </div>
  );
}
