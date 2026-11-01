import { DirectoryCardSkeleton, SkeletonRegion } from "@/components/skeletons";

/** Mirrors talent-pool/PoolView: one directory card (filter bar, total, table). The shell draws the title. */
export default function TalentPoolLoading() {
  return (
    <SkeletonRegion className="space-y-6">
      <DirectoryCardSkeleton
        chips={["w-28"]}
        columns={[
          { width: "w-40" },
          { width: "w-16" },
          { width: "w-20", pill: true },
          { width: "w-20" },
        ]}
      />
    </SkeletonRegion>
  );
}
