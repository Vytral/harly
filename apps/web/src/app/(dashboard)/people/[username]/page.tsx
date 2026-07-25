import { notFound, permanentRedirect } from "next/navigation";

import { getProfileByUsernameAction, listPersonJobsAction } from "@/features/people/actions";
import { PersonProfile } from "@/features/people/PersonProfile";

export const dynamic = "force-dynamic";

type PersonPageProps = {
  params: Promise<{ username: string }>;
};

export default async function PersonPage({ params }: PersonPageProps) {
  const { username } = await params;
  const result = await getProfileByUsernameAction(username);

  if (result.kind === "not_found") {
    notFound();
  }

  if (result.kind === "redirect") {
    permanentRedirect(`/people/${result.username}`);
  }

  const jobs = await listPersonJobsAction(result.profile.id);

  return <PersonProfile profile={result.profile} jobs={jobs} />;
}
