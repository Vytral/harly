import { DirectoryCardSkeleton, PageTitleRowSkeleton, SkeletonRegion } from "@/components/skeletons";

/** Mirrors people/page.tsx: Team title row with description, then the people directory card. */
export default function PeopleLoading() {
  return (
    <SkeletonRegion className="space-y-6">
      <PageTitleRowSkeleton titleWidth="w-20" description actionWidths={[]} />
      <DirectoryCardSkeleton
        actions={false}
        chips={["w-28", "w-32"]}
        columns={[
          { width: "w-28", hide: "sm", pill: true },
          { width: "w-40", hide: "md" },
          { width: "w-24", hide: "sm" },
        ]}
      />
    </SkeletonRegion>
  );
}
