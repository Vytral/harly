import { listPoolCandidates, listOpenJobs } from "@/features/pool/data";
import { PoolView } from "@/features/pool/PoolView";
import { requirePagePermission } from "@/features/workspaces/permissions-server";

export default async function TalentPoolPage() {
  await requirePagePermission("candidates:view");
  const [candidates, openJobs] = await Promise.all([
    listPoolCandidates(),
    listOpenJobs(),
  ]);

  return (
    <div className="space-y-6">
      <PoolView candidates={candidates} openJobs={openJobs} />
    </div>
  );
}
