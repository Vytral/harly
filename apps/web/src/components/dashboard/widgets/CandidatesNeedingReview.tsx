import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Route } from "next";
import { ClipboardCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/utils";
import type { ReviewCandidates } from "@/features/dashboard/widgets";
import { REVIEW_QUEUE_HREF, reviewApplicationHref } from "@/features/review/rules";
import { stageLabel } from "@/features/pipeline/stage-label";
import { Tile, TileHeader, TileLink, EmptyHint } from "./primitives";

/**
 * My pending reviews, longest-waiting first. The header count is the real
 * total and "View all" opens the same set in the review queue; each row opens
 * that application in queue mode.
 */
export function CandidatesNeedingReview({
  review,
  className,
}: {
  review: ReviewCandidates;
  className?: string;
}) {
  const t = useTranslations("shell.candidateReview");
  const tStages = useTranslations("labels.pipeline.stages");
  return (
    <Tile className={className}>
      <TileHeader
        icon={ClipboardCheck}
        title={t("title")}
        count={review.total}
        action={<TileLink href={REVIEW_QUEUE_HREF as Route}>{t("viewAll")}</TileLink>}
      />
      <div className="flex flex-1 flex-col px-2 pb-3 pt-3">
        {review.items.length > 0 ? (
          <ul className="flex-1 flex flex-col gap-0.5">
            {review.items.map((c) => {
              const href = reviewApplicationHref(c.candidateId, c.applicationId) as Route;
              return (
                <li
                  key={c.applicationId}
                  className="flex items-center gap-3 rounded-[var(--radius-md)] pr-3 transition-colors hover:bg-row-wash"
                >
                  <Link
                    href={href}
                    className="group flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-md)] py-2.5 pl-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
                  >
                    <UserAvatar
                      name={c.name}
                      src={c.avatarUrl}
                      fallbackSrcs={c.avatarFallbackSrcs}
                      size="sm"
                    />
                    <div className="min-w-0 flex-[1.3]">
                      <p className="truncate text-sm font-medium" title={c.name}>{c.name}</p>
                      <p className="truncate text-xs text-soft-ink" title={c.job}>{c.job}</p>
                    </div>
                    <Badge variant="neutral" dot={false} className="hidden shrink-0 sm:inline-flex">
                      {stageLabel(c.stage, tStages)}
                    </Badge>
                    <div className="hidden w-36 shrink-0 text-right md:block">
                      <p className="truncate text-sm font-medium">{t(c.action === "interviewFeedback" ? "interviewFeedback" : "resumeReview")}</p>
                      <p
                        className={cn(
                          "truncate text-xs",
                          c.ageDays > 3 ? "text-danger-rust" : "text-soft-ink",
                        )}
                      >
                        {c.ageDays <= 0 ? t("today") : t("ago", { count: c.ageDays })}
                      </p>
                    </div>
                  </Link>
                  <Button variant="outline" size="sm" className="shrink-0 max-md:hidden" asChild>
                    <Link href={href}>{t("review")}</Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyHint
            icon={ClipboardCheck}
            text={t("empty")}
          />
        )}
        {review.total > review.items.length ? (
          <Link
            href={REVIEW_QUEUE_HREF as Route}
            className="mx-3 mt-1 rounded-[var(--radius-md)] px-3 py-2.5 text-center text-xs font-medium text-soft-ink transition hover:bg-row-wash"
          >
            {t("more", { count: review.total - review.items.length })}
          </Link>
        ) : null}
      </div>
    </Tile>
  );
}
