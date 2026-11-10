import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Route } from "next";
import { ListTodo, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tile, TileHeader, EmptyHint } from "./primitives";

export type ForYouItem = {
  label: string;
  count: number;
  href: Route;
  icon: LucideIcon;
  action: string;
};

/**
 * "For you today": one row per kind of work waiting on the viewer. Rows with
 * nothing pending are left out, so the list is the to-do and nothing else.
 */
export function ForYouTodayCard({
  items,
  className,
}: {
  items: ForYouItem[];
  className?: string;
}) {
  const t = useTranslations("shell.forYouToday");
  const pending = items.filter((item) => item.count > 0);
  return (
    <Tile className={className}>
      <TileHeader icon={ListTodo} title={t("title")} />
      {pending.length > 0 ? (
        <ul className="flex flex-col gap-1 px-2 pb-3 pt-3">
          {pending.map((item) => {
            const Icon = item.icon;
            return (
              <li
                key={item.label}
                className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 transition-colors hover:bg-row-wash"
              >
                <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-card-inset">
                  <Icon className="size-[18px] text-near-ink" strokeWidth={1.7} />
                  <span className="absolute -right-1 -top-1 grid min-w-[18px] place-items-center rounded-full bg-near-ink px-1 text-[11px] font-medium leading-[18px] text-pure-snow tabular-nums dark:text-warm-paper">
                    {item.count}
                  </span>
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-near-ink">
                  {item.label}
                </span>
                <Button asChild variant="outline" size="sm">
                  <Link href={item.href}>{item.action}</Link>
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyHint icon={ListTodo} text={t("empty")} />
      )}
    </Tile>
  );
}
