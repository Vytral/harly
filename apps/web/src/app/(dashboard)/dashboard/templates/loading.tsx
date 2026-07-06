import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function TemplatesLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <div className="flex gap-1.5">
                    <Skeleton className="h-4 w-16 rounded-md" />
                    <Skeleton className="h-4 w-16 rounded-md" />
                  </div>
                </div>
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
              <Skeleton className="h-3 w-full max-w-[16rem]" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
