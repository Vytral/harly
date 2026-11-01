import { PageHeaderSkeleton, SkeletonRegion } from "@/components/skeletons";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TEMPLATE_LIST_GRID } from "@/features/document-templates/shared";

/** Mirrors the document templates manager that this route redirects to. */
const ROWS = [0, 1, 2, 3];

export default function DocumentTemplatesLoading() {
  return (
    <SkeletonRegion className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex w-fit items-center gap-1">
        <Skeleton className="h-10 w-20 rounded-full" />
        <Skeleton className="h-10 w-40 rounded-full" />
      </div>

      <PageHeaderSkeleton hasEyebrow={false} />

      <Card className="gap-0 overflow-hidden py-0">
        <div className={`hidden gap-4 border-b border-hairline px-4 py-3 md:grid ${TEMPLATE_LIST_GRID}`}>
          <Skeleton className="h-2.5 w-14" />
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-2.5 w-14" />
          <Skeleton className="h-2.5 w-14" />
          <span />
        </div>
        <div className="divide-y divide-hairline">
          {ROWS.map((i) => (
            <div key={i} className={`grid grid-cols-1 gap-1 px-4 py-3.5 md:items-center md:gap-4 ${TEMPLATE_LIST_GRID}`}>
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-[var(--radius-btn)]" />
                <Skeleton className="h-4 w-44" />
              </div>
              <Skeleton className="h-3 w-48 max-w-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="size-8 rounded-[var(--radius-btn)]" />
            </div>
          ))}
        </div>
      </Card>
    </SkeletonRegion>
  );
}
