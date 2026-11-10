import Link from "next/link";
import type { Route } from "next";
import { LayoutGrid, List } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { cn } from "@/lib/utils";

/** Board ↔ List switch , board for small/medium, list for high volume. */
export async function PipelineViewToggle({
  jobId,
  view,
}: {
  jobId: string;
  view: "board" | "list";
}) {
  const t = await getTranslations("features.pipeline.PipelineViewToggle");
  const items = [
    { key: "list" as const, label: t("list"), icon: List },
    { key: "board" as const, label: t("board"), icon: LayoutGrid },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-soft-kraft p-1">
      {items.map((it) => (
        <Link
          key={it.key}
          href={`/dashboard/pipeline?jobId=${jobId}&view=${it.key}` as Route}
          aria-current={view === it.key ? "page" : undefined}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
            view === it.key
              ? "bg-pure-snow text-near-ink shadow-[var(--shadow-card)]"
              : "text-soft-ink hover:text-near-ink",
          )}
        >
          <it.icon className="size-4" strokeWidth={1.8} />
          {it.label}
        </Link>
      ))}
    </div>
  );
}
