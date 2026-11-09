import Link from "next/link";
import type { Route } from "next";
import { getTranslations } from "next-intl/server";

import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import { CaretRightIcon } from "@/components/ui/icons/phosphor";
import { formatShort } from "@/lib/date";
import type { PortalProgressTone } from "./application-progress";
import { portalApplicationProgress } from "./application-progress";
import type { PortalApplicationSummary } from "./applications-data";
import { PortalStageProgress } from "./PortalStageProgress";

export const PROGRESS_PILL_TONE: Record<PortalProgressTone, StatusPillTone> = {
  info: "info",
  success: "success",
  danger: "danger",
  neutral: "neutral",
};

/** One application in a list: title, context, where it stands, a mini progress bar. */
export async function PortalApplicationRow({
  application,
  showStages,
  orgName,
}: {
  application: PortalApplicationSummary;
  showStages: boolean;
  orgName: string;
}) {
  const t = await getTranslations("features.portal.PortalApplicationRow");
  const tProgress = await getTranslations("labels.portal.applicationProgress");
  const progress = portalApplicationProgress({
    stages: application.stages,
    currentStageId: application.currentStageId,
    status: application.status,
    showStages,
    orgName,
  }, tProgress);
  const meta = [application.jobDepartment, application.jobLocation].filter(Boolean).join(" · ");
  const closed = application.status !== "active";
  const appliedOn = formatShort(application.appliedAt);

  return (
    <li>
      <Link
        href={`/portal/applications/${application.id}` as Route}
        className="group flex items-center gap-4 rounded-2xl border border-hairline bg-card p-4 transition-[border-color,box-shadow,transform] duration-200 hover:border-foreground/15 hover:shadow-[0_2px_12px_rgba(0,0,0,0.05)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.995] sm:p-5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h3 className="min-w-0 truncate text-[15px] font-semibold text-foreground">{application.jobTitle}</h3>
            <StatusPill size="sm" tone={PROGRESS_PILL_TONE[progress.tone]}>
              {progress.label}
            </StatusPill>
          </div>
          <p className="mt-1 truncate text-[13px] text-soft-ink">
            {meta
              ? t("metaApplied", { meta, date: appliedOn })
              : t("applied", { date: appliedOn })}
          </p>
          {application.stages.length > 0 && showStages ? (
            <div className="mt-3 flex items-center gap-3">
              <PortalStageProgress
                stages={application.stages}
                currentStageId={application.currentStageId}
                status={application.status}
                variant="compact"
                className="max-w-56"
              />
              <span className={closed ? "shrink-0 text-[12px] text-soft-ink" : "shrink-0 text-[12px] font-medium text-foreground"}>
                {progress.step && application.status === "active"
                  ? t("stepProgress", { stage: progress.currentStageName ?? "", step: progress.step, total: progress.total })
                  : progress.headline}
              </span>
            </div>
          ) : null}
        </div>
        <CaretRightIcon className="size-4 shrink-0 text-soft-ink transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground" />
      </Link>
    </li>
  );
}
