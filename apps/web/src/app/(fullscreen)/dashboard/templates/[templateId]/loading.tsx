import { Skeleton } from "@/components/ui/skeleton";

export default function TemplateEditorLoading() {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6">
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-5 w-40" />
        <div className="flex justify-self-end gap-2">
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-5 overflow-hidden p-5 lg:grid-cols-[minmax(0,1fr)_minmax(30rem,0.8fr)]">
        <Skeleton className="h-full w-full rounded-xl" />
        <Skeleton className="h-full w-full rounded-xl" />
      </div>
    </div>
  );
}
