import { Skeleton } from "@/components/ui/skeleton";

export default function CareerPageLoading() {
  return (
    <div className="flex h-svh w-full">
      <div className="flex w-full max-w-[440px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-paper-raised p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-lg" />
        ))}
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border bg-paper-raised px-4 py-2.5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-full w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
