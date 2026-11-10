import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Route } from "next";
import {
  ArrowRight,
  Bot,
  Check,
  Globe,
  Briefcase,
  Upload,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SetupChecklist } from "@/features/dashboard/setup-checklist";
import { cn } from "@/lib/utils";
import { tileClass } from "./primitives";

type NextCard = {
  key: string;
  icon: LucideIcon;
  title: string;
  text: string;
  href: Route;
  done: boolean;
};

const PATH = [
  "describe",
  "publish",
  "review",
];

/**
 * First-run Home for an empty workspace: one clear primary action, the three
 * steps ahead, and a few optional next moves. Only shown to owners and admins
 * while there are no real jobs or applications. AI appears as an optional card
 * and only when no provider is configured.
 */
export function FirstRunWelcome({
  checklist,
  aiConfigured,
}: {
  checklist: SetupChecklist;
  aiConfigured: boolean;
}) {
  const t = useTranslations("shell.firstRun");
  const doneKeys = new Set(
    checklist.items.filter((item) => item.done).map((item) => item.key),
  );

  const cards: NextCard[] = [
    {
      key: "invite",
      icon: UserPlus,
      title: t("inviteTitle"),
      text: t("inviteText"),
      href: "/settings/members" as Route,
      done: doneKeys.has("invite_teammate"),
    },
    {
      key: "career",
      icon: Globe,
      title: t("careerTitle"),
      text: t("careerText"),
      href: "/dashboard/career-page" as Route,
      done: false,
    },
    {
      key: "import",
      icon: Upload,
      title: t("importTitle"),
      text: t("importText"),
      href: "/dashboard/candidates?import=csv" as Route,
      done: doneKeys.has("pipeline_candidates"),
    },
  ];
  if (!aiConfigured) {
    cards.push({
      key: "ai",
      icon: Bot,
      title: t("aiTitle"),
      text: t("aiText"),
      href: "/settings/ai" as Route,
      done: false,
    });
  }

  return (
    <section
      aria-labelledby="first-run-title"
      className="mt-5 duration-500 animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none"
    >
      <div className={cn(tileClass, "overflow-hidden")}>
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center">
          <div className="min-w-0">
            <p className="font-chrome text-[11px] uppercase tracking-[0.14em] text-soft-ink">
              {t("ready")}
            </p>
            <h2
              id="first-run-title"
              className="font-display mt-2 text-balance text-[26px] leading-[1.15] text-near-ink sm:text-[30px]"
            >
              {t("start")}
            </h2>
            <p className="mt-2 max-w-[46ch] text-pretty text-[14px] text-soft-ink">
              {t("description")}
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Button asChild>
                <Link href={"/dashboard/jobs/new" as Route}>
                  <Briefcase className="size-4" />
                  {t("createJob")}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={"/dashboard/career-page" as Route}>{t("preview")}</Link>
              </Button>
            </div>
          </div>

          <ol className="relative flex flex-col gap-3 rounded-[var(--radius-inner)] bg-card-inset p-5">
            {PATH.map((label, i) => (
              <li key={label} className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums",
                    i === 0
                      ? "bg-near-ink text-pure-snow dark:text-warm-paper"
                      : "bg-pure-snow text-soft-ink shadow-[var(--shadow-card)]",
                  )}
                >
                  {i + 1}
                </span>
                <span
                  className={cn(
                    "text-[14px]",
                    i === 0 ? "font-medium text-near-ink" : "text-soft-ink",
                  )}
                >
                  {t(label)}
                </span>
              </li>
            ))}
            <div className="mt-1 flex items-center gap-2.5 border-t border-hairline pt-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-pure-snow">
                <div
                  className="h-full rounded-full bg-near-ink transition-[width] duration-500 motion-reduce:transition-none"
                  style={{ width: `${checklist.percent}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-soft-ink">
                {t("progress", { completed: checklist.completed, total: checklist.total })}
              </span>
            </div>
          </ol>
        </div>

        <ul className="grid grid-cols-1 gap-px border-t border-hairline bg-hairline sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <li key={card.key} className="bg-pure-snow">
                <Link
                  href={card.href}
                  className="group flex h-full items-start gap-3 p-5 transition-colors hover:bg-row-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-near-ink"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow">
                    {card.done ? (
                      <Check className="size-4 text-success-olive" strokeWidth={2} />
                    ) : (
                      <Icon className="size-4 text-near-ink" strokeWidth={1.8} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-[13.5px] font-medium text-near-ink">
                      {card.title}
                      <ArrowRight className="size-3.5 -translate-x-1 text-soft-ink opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none" />
                    </span>
                    <span className="mt-0.5 block text-pretty text-xs text-soft-ink">
                      {card.text}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
