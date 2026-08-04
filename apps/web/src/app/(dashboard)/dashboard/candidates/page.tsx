import Link from "next/link";
import type { Route } from "next";
import { Trash2, Users } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/UserAvatar";
import {
  CandidatesTable,
  type CandidateRow,
} from "@/features/candidates/CandidatesTable";
import {
  ImportCandidatesDrawer,
  type ImportSource,
} from "@/features/candidates/import/ImportCandidatesDrawer";
import {
  listCandidateDirectory,
  listCandidateDirectoryFacets,
  listTrashedCandidates,
  type CandidateApplicationStatus,
  type CandidateDirectoryFilters,
} from "@/features/candidates/data";
import { TrashCandidateActions } from "@/features/candidates/TrashCandidateActions";
import { AddCandidateDrawer } from "@/features/candidates/AddCandidateDrawer";
import { listEmailTemplates } from "@/features/email-templates/data";
import { listJobOptions } from "@/features/jobs/data";
import { listWorkspaceMembers } from "@/features/jobs/hiring-team-data";
import { getWorkspaceContext } from "@/features/workspaces/context";
import { can } from "@/features/workspaces/permissions-server";
import { candidateAvatarFallbackSrcs } from "@/lib/candidate-avatar";
import { formatRelative, formatShort } from "@/lib/date";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function appliedLabel(value: Date) {
  const days = Math.abs(Date.now() - value.getTime()) / 86_400_000;
  return days < 30 ? formatRelative(value) : formatShort(value);
}

type CandidatesPageProps = {
  searchParams: Promise<{
    view?: string;
    import?: string;
    q?: string;
    dept?: string;
    role?: string;
    stage?: string;
    status?: string;
    source?: string;
    tag?: string;
    sort?: string;
    page?: string;
  }>;
};

export default async function CandidatesPage({ searchParams }: CandidatesPageProps) {
  const { view, import: importSource, q, dept, role, stage, status, source, tag, sort, page: pageRaw } = await searchParams;
  const isTrash = view === "trash";
const initialImportSource: ImportSource | undefined =
    importSource === "csv" ||
    importSource === "greenhouse" ||
    importSource === "workable" ||
    importSource === "ashby" ||
    importSource === "lever" ||
    importSource === "join"
      ? importSource
      : undefined;

  const candidateStatus =
    status === "active" ||
    status === "hired" ||
    status === "rejected" ||
    status === "withdrawn"
      ? status
      : undefined;
  const candidateSort: CandidateDirectoryFilters["sort"] =
    sort === "oldest" || sort === "modified" || sort === "name"
      ? sort
      : "recent";

  const directoryFilters = {
    query: q,
    department: dept,
    role,
    stage,
    status: candidateStatus as CandidateApplicationStatus | undefined,
    source,
    tag,
    sort: candidateSort,
    page: Number.isFinite(Number(pageRaw)) ? Number(pageRaw) : 1,
    pageSize: 50,
  };
  const [
    directory,
    facets,
    trashed,
    emailTemplates,
    jobOptions,
    members,
    workspaceContext,
    canCreateCandidates,
  ] = await Promise.all([
    listCandidateDirectory(directoryFilters),
    listCandidateDirectoryFacets(),
    listTrashedCandidates(),
    listEmailTemplates(),
    listJobOptions(),
    listWorkspaceMembers(),
    getWorkspaceContext(),
    can("candidates:edit"),
  ]);

  const rows: CandidateRow[] = directory.rows.map((candidate) => {
    const applied = candidate.latestApplication?.appliedAt ?? null;
    return {
      id: candidate.id,
      fullName: candidate.fullName,
      email: candidate.email,
      phone: candidate.phone,
      avatarUrl: candidate.avatarUrl,
      avatarFallbackSrcs: candidateAvatarFallbackSrcs(candidate.email, candidate.githubUrl),
      inPool: candidate.inPool,
      hasOpenPrivacyRequest: candidate.hasOpenPrivacyRequest,
      isReferred: candidate.isReferred,
      isFeaturedReferral: candidate.isFeaturedReferral,
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
      updatedAt: candidate.updatedAt.getTime(),
    };
  });

  return (
    <div className="space-y-5">
      <div className="flex w-fit items-center gap-1 rounded-lg border bg-card p-1 text-sm">
        <Tab href="/dashboard/candidates" active={!isTrash}>
          All
          <span className="ml-1.5 tabular-nums text-muted-foreground">{rows.length}</span>
        </Tab>
        <Tab href="/dashboard/candidates?view=trash" active={isTrash}>
          <Trash2 className="size-3.5" />
          Trash
          <span className="ml-1.5 tabular-nums text-muted-foreground">{trashed.length}</span>
        </Tab>
      </div>

      {isTrash ? (
        trashed.length > 0 ? (
          <Card className="gap-0 divide-y divide-border/60 overflow-hidden py-0">
            {trashed.map((candidate) => (
              <div
                key={candidate.id}
                className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <UserAvatar
                    name={candidate.fullName}
                    src={null}
                    fallbackSrcs={candidateAvatarFallbackSrcs(candidate.email, candidate.githubUrl)}
                    size="lg"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-muted-foreground">
                      {candidate.fullName}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      Deleted {formatRelative(candidate.deletedAt)}
                    </span>
                  </span>
                </span>
                <TrashCandidateActions
                  candidateId={candidate.id}
                  candidateName={candidate.fullName}
                />
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState
            icon={Trash2}
            title="Trash is empty"
            description="Candidates you delete show up here and can be restored."
          />
        )
      ) : rows.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            icon={Users}
            title="No candidates yet"
            description="Share your public job board or import candidates from another ATS."
          />
          <div className="flex justify-center gap-2">
            {canCreateCandidates ? (
              <AddCandidateDrawer
                workspaceId={workspaceContext.organization.id}
                jobs={jobOptions.map((job) => ({ id: job.id, title: job.title }))}
                members={members}
                currentUserId={workspaceContext.user.id}
              />
            ) : null}
            <ImportCandidatesDrawer
              jobs={jobOptions.map((job) => ({ id: job.id, title: job.title }))}
              initialSource={initialImportSource}
            />
          </div>
        </div>
      ) : (
        <CandidatesTable
          key={JSON.stringify(directoryFilters)}
          rows={rows}
          pageInfo={{ page: directory.page, pageSize: directory.pageSize, total: directory.total, hasNextPage: directory.hasNextPage }}
          filterOptions={facets}
          initialFilters={{ query: q ?? "", dept: dept ?? "__all__", role: role ?? "__all__", stage: stage ?? "__all__", status: candidateStatus ?? "__all__", source: source ?? "__all__", tag: tag ?? "__all__", sort: candidateSort }}
          emailTemplates={emailTemplates}
          importJobs={jobOptions.map((job) => ({ id: job.id, title: job.title }))}
          initialImportSource={initialImportSource}
          manualCandidate={
            canCreateCandidates
              ? {
                  workspaceId: workspaceContext.organization.id,
                  members,
                  currentUserId: workspaceContext.user.id,
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href as Route}
      className={cn(
        "flex items-center gap-1 rounded-md px-3 py-1.5 font-medium transition",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
