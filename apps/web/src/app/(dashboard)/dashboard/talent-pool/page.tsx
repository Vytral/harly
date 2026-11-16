import { listPoolCandidates, listOpenJobs } from "@/features/pool/data";
import { PoolView } from "@/features/pool/PoolView";
import { can, requirePagePermission } from "@/features/workspaces/permissions-server";

export default async function TalentPoolPage() {
  await requirePagePermission("candidates:view");
  const [candidates, openJobs] = await Promise.all([
    listPoolCandidates(),
    // Assigning to a job needs the job list; without jobs:view the picker is empty.
    (await can("jobs:view")) ? listOpenJobs() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PoolView candidates={candidates} openJobs={openJobs} />
    </div>
  );
}
