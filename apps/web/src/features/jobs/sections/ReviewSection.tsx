import { CheckCircle2, Rocket } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Job } from "@harly/db";

import type { HiringTeamMember, WorkspaceMemberOption } from "../hiring-team-data";
import { JobHiringTeam } from "../JobHiringTeam";
import { PublicJobPreview } from "../PublicJobPreview";
import { SemanticMatchPanel } from "@/features/matching/SemanticMatchPanel";

export function ReviewSection({
  job,
  title,
  workplace,
  submitLabel,
  reviewVisited,
  hiringTeam,
  workspaceMembers,
  aiConfigured,
  candidatePoolCount,
}: {
  job?: Job;
  title: string;
  workplace: string;
  submitLabel: string;
  reviewVisited: boolean;
  hiringTeam?: HiringTeamMember[];
  workspaceMembers?: WorkspaceMemberOption[];
  aiConfigured?: boolean;
  candidatePoolCount?: number;
}) {
  const t = useTranslations("jobs.review");
  const workplaceLabels: Record<string, string> = {
    remote: t("remote"),
    hybrid: t("hybrid"),
    onsite: t("onsite"),
  };
  return (
    <div data-section="review" className="space-y-5">
      <div className="rounded-[var(--radius-card)] bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-inner)] bg-lime-wash text-success-olive">
            <CheckCircle2 className="size-4.5" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-[15px] font-semibold tracking-tight">
              {title || t("newJob")}
            </p>
            <p className="mt-0.5 text-sm text-soft-ink">
              {workplaceLabels[workplace] ?? workplace}
              {job ? ` · ${t("readyToSave")}` : ` · ${t("readyTo", { action: submitLabel.toLowerCase() })}`}
            </p>
          </div>
        </div>
      </div>

      {job ? (
        <>
          <JobHiringTeam jobId={job.id} team={hiringTeam ?? []} members={workspaceMembers ?? []} />
          {reviewVisited ? (
            <>
              <SemanticMatchPanel
                jobId={job.id}
                aiConfigured={Boolean(aiConfigured)}
                candidatePoolCount={candidatePoolCount ?? 0}
              />
              <PublicJobPreview slug={job.slug} />
            </>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] bg-card p-8 text-center shadow-[var(--shadow-card)]">
          <span className="flex size-10 items-center justify-center rounded-full bg-card-inset text-soft-ink">
            <Rocket className="size-5" />
          </span>
          <p className="text-sm font-medium">{t("unlocksAfterPublish")}</p>
          <p className="max-w-sm text-sm text-soft-ink">
            {t("publishFirst")}
          </p>
        </div>
      )}
    </div>
  );
}
