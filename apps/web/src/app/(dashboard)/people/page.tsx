import { UserRound } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { listPeopleAction } from "@/features/people/actions";
import { PeopleTable, type PersonListRow } from "@/features/people/PeopleTable";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
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
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">People</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone on the team, with contact details, specialties, and availability.
        </p>
      </div>

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
