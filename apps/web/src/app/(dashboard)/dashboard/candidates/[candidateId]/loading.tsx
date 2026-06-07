import { Skeleton } from "@/components/ui/skeleton";

export default function CandidateDetailLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {/* Left rail */}
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
          <div className="border-b border-border/60 px-4 py-3.5">
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="space-y-1 p-1.5">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 px-2.5 py-2.5">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Profile */}
        <div className="space-y-5">
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
            <Skeleton className="h-20 rounded-none" />
            <div className="-mt-10 space-y-4 px-5 pb-5">
              <Skeleton className="size-20 rounded-full ring-4 ring-card" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-52" />
                <Skeleton className="h-4 w-72 max-w-full" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-7 w-44 rounded-full" />
                <Skeleton className="h-7 w-28 rounded-full" />
              </div>
            </div>
          </div>
          <Skeleton className="h-9 w-72 rounded-lg" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
