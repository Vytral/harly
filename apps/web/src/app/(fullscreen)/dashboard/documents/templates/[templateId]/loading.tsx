import { SkeletonRegion } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors DocumentTemplateEditorPage: top bar, name/title fields, editor and variable rail. */
export default function DocumentTemplateEditorLoading() {
  return (
    <div className="flex min-h-dvh flex-col bg-warm-paper">
      <SkeletonRegion className="contents">
        <header className="flex flex-wrap items-center justify-between gap-3 bg-pure-snow px-5 py-4 shadow-[var(--shadow-card)] sm:px-8">
          <Skeleton className="h-4 w-44" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20 rounded-[var(--radius-btn)]" />
            <Skeleton className="h-9 w-32 rounded-[var(--radius-btn)]" />
          </div>
        </header>
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-7 w-72 max-w-full" />
              <Skeleton className="h-4 w-96 max-w-full" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
              <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
            </div>
            <Skeleton className="h-[30rem] w-full rounded-[var(--radius-card)]" />
          </section>
          <aside className="h-fit space-y-4 rounded-[var(--radius-card)] bg-pure-snow p-5 shadow-[var(--shadow-card)]">
            <Skeleton className="h-4 w-20" />
            <div className="flex flex-wrap gap-1.5">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <Skeleton key={i} className="h-6 w-28 rounded-full" />
              ))}
            </div>
          </aside>
        </div>
      </SkeletonRegion>
    </div>
  );
}
