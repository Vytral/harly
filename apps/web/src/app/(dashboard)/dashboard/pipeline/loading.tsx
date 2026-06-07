import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PipelineLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-7 w-56" />
      </div>
      <Card>
        <CardContent>
          <Skeleton className="h-9 w-full max-w-md" />
        </CardContent>
      </Card>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="w-72 shrink-0 rounded-xl border bg-muted/40">
            <div className="border-b p-3">
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="space-y-2 p-2">
              <Skeleton className="h-24 rounded-lg" />
              <Skeleton className="h-24 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
