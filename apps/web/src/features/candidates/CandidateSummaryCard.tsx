"use client";

import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";
import { InfoRow, InfoRows } from "@/components/ui/info-row";
import { ShortDate } from "@/lib/date-hydration";
import { stageLabel } from "@/features/pipeline/stage-label";
import {
  RejectionReasonTag,
  type ApplicationRejectionSummary,
} from "@/features/rejection-reasons/RejectionReasonTag";

const SOURCE_KEY: Record<string, string> = {
  public_form: "jobBoard",
  csv_import: "csvImport",
  referral: "referral",
  linkedin: "linkedin",
  career_page: "careerPage",
  agency: "agency",
  direct_apply: "directApply",
  internal: "internal",
  email: "email",
  event: "event",
  manual: "manual",
};

/**
 * Right-column "Details" card: the facts that used to crowd the header
 * (source, applied date, tags) plus job, stage and record creation.
 */
export function CandidateSummaryCard({
  jobTitle,
  stageName,
  source,
  appliedAt,
  createdAt,
  tags,
  applicationCount,
  rejection = null,
}: {
  jobTitle: string | null;
  stageName: string | null;
  source: string | null;
  appliedAt: string | null;
  createdAt: string;
  tags: Array<{ id: string; label: string }>;
  applicationCount: number;
  rejection?: ApplicationRejectionSummary | null;
}) {
  const t = useTranslations("candidates.summaryCard");
  const tStages = useTranslations("labels.pipeline.stages");
  return (
    <Card className="gap-0 py-0">
      <h2 className="px-5 py-4 text-[15px] font-semibold tracking-[-0.01em] text-near-ink">
        {t("details")}
      </h2>
      <div className="border-t border-hairline p-3">
        <InfoRows>
          <InfoRow label={t("job")} value={jobTitle} />
          <InfoRow label={t("stage")} value={stageName ? stageLabel(stageName, tStages) : null} />
          {rejection?.reasonLabel ? (
            <InfoRow
              label={t("rejection")}
              value={<RejectionReasonTag rejection={rejection} showStatus={false} />}
            />
          ) : null}
          <InfoRow
            label={t("source")}
            value={source ? (SOURCE_KEY[source] ? t(`sources.${SOURCE_KEY[source]}`) : source) : null}
          />
          <InfoRow
            label={t("applied")}
            value={appliedAt ? <ShortDate value={appliedAt} /> : null}
          />
          {applicationCount > 1 ? (
            <InfoRow label={t("applications")} value={applicationCount} />
          ) : null}
          <InfoRow
            label={t("tags")}
            empty={t("noTags")}
            value={tags.length > 0 ? tags.map((tag) => tag.label).join(", ") : null}
          />
          <InfoRow label={t("added")} value={<ShortDate value={createdAt} />} />
        </InfoRows>
      </div>
    </Card>
  );
}
