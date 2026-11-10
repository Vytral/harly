import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors templates/[templateId]/page.tsx → TemplateEditorPage: the header with
 * back link, title and Cancel/Save, then the two-column main area (name and
 * type, subject, message editor) beside the variables aside.
 */
export default async function TemplateEditorLoading() {
  const t = await getTranslations("pages.templateEditor.loading");

  return (
    <div aria-busy="true" className="flex h-dvh w-full flex-col overflow-hidden bg-warm-paper">
      <span className="sr-only">{t("label")}</span>

      <header className="shrink-0 bg-pure-snow shadow-[var(--shadow-card)]">
        <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-32" />
          <div className="flex justify-self-end gap-2">
            <Skeleton className="h-9 w-16 rounded-[var(--radius-btn)]" />
            <Skeleton className="h-9 w-36 rounded-[var(--radius-btn)]" />
          </div>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(30rem,0.8fr)] lg:overflow-hidden">
        <section className="min-w-0 space-y-7 px-4 py-8 sm:px-6 lg:overflow-y-auto lg:px-10 xl:px-14">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_13rem]">
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-14" />
              <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3 w-80 max-w-full" />
            <div className="min-h-[24rem] rounded-[var(--radius-card)] bg-pure-snow p-8 shadow-[var(--shadow-card)] sm:p-10">
              <div className="space-y-3">
                {["w-11/12", "w-full", "w-5/6", "w-3/4", "w-full", "w-2/3"].map((width, i) => (
                  <Skeleton key={i} className={`h-3.5 ${width}`} />
                ))}
              </div>
            </div>
          </div>
        </section>

        <aside className="border-t border-hairline bg-card-inset px-4 py-8 sm:px-6 lg:overflow-y-auto lg:border-l lg:border-t-0 lg:px-8 xl:px-10">
          <section className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-72 max-w-full" />
            <div className="mt-6 space-y-5">
              {Array.from({ length: 3 }).map((_, g) => (
                <div key={g} className="space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-7 w-20 rounded-md" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}
