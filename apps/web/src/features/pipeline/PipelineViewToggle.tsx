import Link from "next/link";
import type { Route } from "next";
import { LayoutGrid, List } from "lucide-react";

import { cn } from "@/lib/utils";

/** Board ↔ List switch — board for small/medium, list for high volume. */
export function PipelineViewToggle({
  jobId,
  view,
}: {
  jobId: string;
  view: "board" | "list";
}) {
  const items = [
    { key: "list" as const, label: "List", icon: List },
    { key: "board" as const, label: "Board", icon: LayoutGrid },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border bg-card p-1">
      {items.map((it) => (
        <Link
          key={it.key}
          href={`/dashboard/pipeline?job=${jobId}&view=${it.key}` as Route}
          aria-current={view === it.key ? "page" : undefined}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition",
            view === it.key
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <it.icon className="size-4" strokeWidth={1.8} />
          {it.label}
        </Link>
      ))}
    </div>
  );
}
