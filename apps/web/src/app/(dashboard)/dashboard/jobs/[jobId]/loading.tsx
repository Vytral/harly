import { Skeleton } from "@/components/ui/skeleton";

export default function JobDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-9 w-48 rounded-lg" />
      </div>
      {/* Wizard stepper */}
      <Skeleton className="h-16 w-full rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Skeleton className="h-[28rem] w-full rounded-2xl" />
        <Skeleton className="hidden h-44 w-full rounded-2xl lg:block" />
      </div>
    </div>
  );
}
