import { Skeleton } from "@/components/ui/skeleton";

function IntegrationRowSkeleton() {
  return (
    <div className="flex items-center gap-3 border-t border-border/60 py-3.5 sm:px-2">
      <Skeleton className="size-10 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-52 max-w-full" />
      </div>
      <Skeleton className="size-8 rounded-lg" />
    </div>
  );
}

export default function IntegrationsSettingsLoading() {
  return (
    <div className="space-y-8">
      {Array.from({ length: 4 }).map((_, groupIndex) => (
        <section key={groupIndex} className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <div className="grid gap-x-10 sm:grid-cols-2">
            {Array.from({ length: groupIndex === 3 ? 2 : 4 }).map((_, rowIndex) => (
              <IntegrationRowSkeleton key={rowIndex} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
