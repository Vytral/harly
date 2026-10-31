"use client";

import { Card } from "@/components/ui/card";
import { InfoRow, InfoRows } from "@/components/ui/info-row";
import { ShortDate } from "@/lib/date-hydration";

const SOURCE_LABEL: Record<string, string> = {
  public_form: "Job board",
  csv_import: "CSV import",
  referral: "Referral",
  linkedin: "LinkedIn",
  career_page: "Career page",
  agency: "Agency",
  direct_apply: "Direct apply",
  internal: "Internal",
  email: "Email",
  event: "Event",
  manual: "Manual",
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
}: {
  jobTitle: string | null;
  stageName: string | null;
  source: string | null;
  appliedAt: string | null;
  createdAt: string;
  tags: Array<{ id: string; label: string }>;
  applicationCount: number;
}) {
  return (
    <Card className="gap-0 py-0">
      <h2 className="px-5 py-4 text-[15px] font-semibold tracking-[-0.01em] text-near-ink">
        Details
      </h2>
      <div className="border-t border-hairline p-3">
        <InfoRows>
          <InfoRow label="Job" value={jobTitle} />
          <InfoRow label="Stage" value={stageName} />
          <InfoRow
            label="Source"
            value={source ? (SOURCE_LABEL[source] ?? source) : null}
          />
          <InfoRow
            label="Applied"
            value={appliedAt ? <ShortDate value={appliedAt} /> : null}
          />
          {applicationCount > 1 ? (
            <InfoRow label="Applications" value={applicationCount} />
          ) : null}
          <InfoRow
            label="Tags"
            empty="No tags"
            value={tags.length > 0 ? tags.map((tag) => tag.label).join(", ") : null}
          />
          <InfoRow label="Added" value={<ShortDate value={createdAt} />} />
        </InfoRows>
      </div>
    </Card>
  );
}
