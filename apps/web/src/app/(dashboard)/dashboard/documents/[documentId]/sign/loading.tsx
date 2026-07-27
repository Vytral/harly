import { Skeleton } from "@/components/ui/skeleton";

export default function NativeSignLoading() {
  return (
    <div className="flex h-svh w-full">
      <div className="flex-1 space-y-3 border-r border-border/60 p-4">
        <Skeleton className="h-9 w-full max-w-xs rounded-lg" />
        <Skeleton className="h-[80vh] w-full rounded-xl" />
      </div>
      <div className="w-72 shrink-0 space-y-3 p-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
    </div>
  );
}
