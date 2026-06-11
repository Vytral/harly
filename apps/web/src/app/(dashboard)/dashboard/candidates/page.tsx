import { Users } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  CandidatesTable,
  type CandidateRow,
} from "@/features/candidates/CandidatesTable";
import { listCandidates } from "@/features/candidates/data";
import { listEmailTemplates } from "@/features/email-templates/data";
import { listJobOptions } from "@/features/jobs/data";
import { gravatarUrl } from "@/lib/gravatar";
import { formatRelative, formatShort } from "@/lib/date";

export const dynamic = "force-dynamic";

function appliedLabel(value: Date) {
  const days = Math.abs(Date.now() - value.getTime()) / 86_400_000;
  return days < 30 ? formatRelative(value) : formatShort(value);
}

export default async function CandidatesPage() {
  const [candidates, emailTemplates, jobOptions] = await Promise.all([
    listCandidates(),
    listEmailTemplates(),
    listJobOptions(),
  ]);

  const rows: CandidateRow[] = candidates.map((candidate) => {
    const applied = candidate.latestApplication?.appliedAt ?? null;
    return {
      id: candidate.id,
      fullName: candidate.fullName,
      email: candidate.email,
      phone: candidate.phone,
      avatarUrl: candidate.email ? gravatarUrl(candidate.email) : null,
      location: candidate.location,
      role: candidate.latestApplication?.jobTitle ?? null,
      department: candidate.latestApplication?.department ?? null,
      stage: candidate.latestApplication?.currentStageName ?? null,
      status: candidate.latestApplication?.status ?? null,
      source: candidate.latestApplication?.source ?? null,
      tags: candidate.tags,
      appliedAt: applied ? applied.getTime() : null,
      appliedLabel: applied ? appliedLabel(applied) : null,
      applicationId: candidate.latestApplication?.applicationId ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Candidates"
        title="Candidates"
        description="Everyone who has applied across your job board."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No candidates yet"
          description="Share your public job board to start receiving applications."
        />
      ) : (
        <CandidatesTable
          rows={rows}
          emailTemplates={emailTemplates}
          importJobs={jobOptions.map((job) => ({ id: job.id, title: job.title }))}
        />
      )}
    </div>
  );
}
