import { getTranslations } from "next-intl/server";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors settings/email/replies/page.tsx → ReplyHandlingSettingsForm: ghost
 * back link, then the page section with the reply-route select, the mailbox
 * fields in a two-column grid, the enabled switch row, the read-only webhook
 * URL with copy button, and the Save footer.
 */
export default async function ConfigureReplyHandlingLoading() {
  const t = await getTranslations("pages.settingsEmailReplies.loading");
  return (
    <div aria-busy="true" className="space-y-5">
      <span className="sr-only">{t("loading")}</span>

      <div className="-ml-3 flex h-8 w-fit items-center px-3">
        <Skeleton className="h-4 w-32" />
      </div>

      <section className="mx-auto w-full max-w-4xl space-y-6">
        <header className="space-y-2 border-b border-hairline pb-5">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-3.5 w-[28rem] max-w-full" />
        </header>

        <div className="max-w-3xl space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-9 w-full rounded-[var(--radius-btn)]" />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <div className="flex gap-2">
              <Skeleton className="h-9 flex-1 rounded-[var(--radius-btn)]" />
              <Skeleton className="h-9 w-20 rounded-[var(--radius-btn)]" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-6 rounded-[var(--radius-inner)] border border-hairline px-5 py-4">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-72 max-w-full" />
            </div>
            <Skeleton className="h-5 w-9 shrink-0 rounded-full" />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-hairline pt-5">
            <Skeleton className="h-9 w-28 rounded-[var(--radius-btn)]" />
          </div>
        </div>
      </section>
    </div>
  );
}
