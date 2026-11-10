import type { Route } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { StatusPill } from "@/components/ui/status-pill";
import { candidateHref, REVIEW_ORIGIN } from "@/features/candidates/origin";
import type { ReviewQueueItem } from "@/features/review/queue";

/**
 * The review queue as a list: oldest wait first, each row opening the
 * candidate in queue mode so previous / next and auto-advance follow it.
 */
export async function ReviewQueueList({ items }: { items: ReviewQueueItem[] }) {
  const t = await getTranslations("features.review.reviewQueueList");
  const tAction = await getTranslations("labels.review.queueAction");

  function waitingLabel(days: number) {
    if (days <= 0) return t("waitingToday");
    return t("waitingDays", { count: days });
  }

  return (
    <Card className="gap-0 divide-y divide-hairline overflow-hidden py-0">
      <ol aria-label={t("queueLabel")} className="divide-y divide-hairline">
        {items.map((item, index) => (
          <li key={item.applicationId}>
            <Link
              href={candidateHref(item.candidateId, REVIEW_ORIGIN, item.applicationId) as Route}
              className="group flex min-h-[64px] items-center gap-3 px-5 py-3 outline-none transition-colors hover:bg-row-wash/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-near-ink"
            >
              <span className="w-6 shrink-0 text-right text-[12.5px] tabular-nums text-quiet-mist">
                {index + 1}
              </span>
              <UserAvatar
                name={item.name}
                src={item.avatarUrl}
                fallbackSrcs={item.avatarFallbackSrcs}
                size="lg"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium text-near-ink group-hover:underline">
                  {item.name}
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-soft-ink">
                  {item.job} · {item.stage}
                </span>
              </span>
              <span className="hidden sm:block">
                <StatusPill tone={item.stageKind === "interview" ? "info" : "neutral"} size="sm">
                  {tAction(item.action)}
                </StatusPill>
              </span>
              <span
                className={
                  item.ageDays > 7
                    ? "w-16 shrink-0 text-right text-[13px] font-medium text-destructive"
                    : "w-16 shrink-0 text-right text-[13px] text-soft-ink"
                }
                title={t("waitingInStage")}
              >
                {waitingLabel(item.ageDays)}
              </span>
              <ChevronRight className="size-4 shrink-0 text-quiet-mist" aria-hidden />
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
