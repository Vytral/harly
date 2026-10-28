import { Skeleton } from "@/components/ui/skeleton";

/**
 * Portal segment placeholder. Mirrors the portal shell (a page title and a
 * stack of cards) so the first paint is not a blank screen.
 */
export default function PortalLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8" aria-busy="true" aria-label="Loading your portal">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 rounded-xl border bg-card p-4">
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
