import { CheckCircle2, Rocket } from "lucide-react";
import type { Job } from "@harly/db";

import type { HiringTeamMember, WorkspaceMemberOption } from "../hiring-team-data";
import { JobHiringTeam } from "../JobHiringTeam";
import { PublicJobPreview } from "../PublicJobPreview";
import { SemanticMatchPanel } from "@/features/matching/SemanticMatchPanel";

const WORKPLACE_LABEL: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "Onsite",
};

export function ReviewSection({
  job,
  title,
  workplace,
  submitLabel,
  reviewVisited,
  hiringTeam,
  workspaceMembers,
  aiConfigured,
}: {
  job?: Job;
  title: string;
  workplace: string;
  submitLabel: string;
  reviewVisited: boolean;
  hiringTeam?: HiringTeamMember[];
  workspaceMembers?: WorkspaceMemberOption[];
  aiConfigured?: boolean;
}) {
  return (
    <div data-section="review" className="space-y-5">
      <div className="rounded-2xl border border-border/70 bg-card p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CheckCircle2 className="size-4.5" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-[15px] font-semibold tracking-tight">
              {title || "New job"}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {WORKPLACE_LABEL[workplace] ?? workplace}
              {job ? " · Ready to save" : ` · Ready to ${submitLabel.toLowerCase()}`}
            </p>
          </div>
        </div>
      </div>

      {job ? (
        <>
          <JobHiringTeam jobId={job.id} team={hiringTeam ?? []} members={workspaceMembers ?? []} />
          {reviewVisited ? (
            <>
              <SemanticMatchPanel jobId={job.id} aiConfigured={Boolean(aiConfigured)} />
              <PublicJobPreview slug={job.slug} />
            </>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/70 bg-card p-8 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Rocket className="size-5" />
          </span>
          <p className="text-sm font-medium">Hiring team, AI matching, and live preview unlock after you publish</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Save this job first — you&apos;ll be able to assign a hiring team, rank your candidate pool, and preview
            the public listing right after.
          </p>
        </div>
      )}
    </div>
  );
}
