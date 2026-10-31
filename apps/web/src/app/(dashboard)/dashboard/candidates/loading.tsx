import { DirectoryCardSkeleton, DirectoryTabsSkeleton, PageTitleRowSkeleton, SkeletonRegion } from "@/components/skeletons";

/** Mirrors candidates/page.tsx: title row, All/Trash tabs, one directory card. */
export default function CandidatesLoading() {
  return (
    <SkeletonRegion className="space-y-6">
      <PageTitleRowSkeleton titleWidth="w-44" actionWidths={["w-28", "w-40"]} />
      <DirectoryTabsSkeleton widths={["w-16", "w-20"]} />
      <DirectoryCardSkeleton
        chips={["w-28", "w-24", "w-24", "w-24", "w-24", "w-20"]}
        trailing="w-36"
        columns={[
          { width: "w-28", hide: "md" },
          { width: "w-28", hide: "md" },
          { width: "w-20", hide: "lg" },
          { width: "w-20", pill: true },
        ]}
      />
    </SkeletonRegion>
  );
}
