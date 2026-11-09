import Link from "next/link";
import type { Route } from "next";
import { Briefcase, Plus, Trash2 } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusPill } from "@/components/ui/status-pill";
import {
  listJobsWithStats,
  listTrashedJobs,
} from "@/features/jobs/data";
import { JobsTable } from "@/features/jobs/JobsTable";
import { JobIdentity } from "@/features/jobs/JobIdentity";
import { TrashJobActions } from "@/features/jobs/TrashJobActions";
import { cn } from "@/lib/utils";
import { requirePagePermission } from "@/features/workspaces/permissions-server";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

type JobsPageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function DashboardJobsPage({ searchParams }: JobsPageProps) {
  const t = await getTranslations("jobs.list");
  await requirePagePermission("jobs:view");
  const { view } = await searchParams;
  const isTrash = view === "trash";

  const [jobs, trashed] = await Promise.all([
    listJobsWithStats(),
    listTrashedJobs(),
  ]);

  const openRoles = jobs.filter((j) => j.status === "open").length;
  const draftRoles = jobs.filter((j) => j.status === "draft").length;
  const closedRoles = jobs.filter((j) => j.status === "closed").length;
  const totalApplicants = jobs.reduce((sum, j) => sum + j.applicants, 0);
  const newApplicants = jobs.reduce((sum, j) => sum + j.newApplicants, 0);

  return (
    <div className="space-y-5">
      {/* Title row. Rendered here (not by the shell) because it carries the
          page action; the Jobs nav item's shellTitle flag must be off. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[28px] leading-9 tracking-tight text-near-ink">
          {t("title")}
        </h1>
        <Button asChild>
          <Link href="/dashboard/jobs/new">
            <Plus className="size-4" />
            {t("create")}
          </Link>
        </Button>
      </div>

      {!isTrash && jobs.length > 0 ? (
        <Card className="p-3">
          <section
            aria-label={t("overview")}
            className="grid grid-cols-2 gap-2 lg:grid-cols-4"
          >
            <StatTile
              label={<StatusPill tone="neutral">{t("draft")}</StatusPill>}
              value={draftRoles}
              muted={draftRoles === 0}
              hint={t("notPublished")}
            />
            <StatTile
              label={<StatusPill tone="success">{t("open")}</StatusPill>}
              value={openRoles}
              muted={openRoles === 0}
              hint={t("acceptingApplicants")}
            />
            <StatTile
              label={<StatusPill tone="warning">{t("closed")}</StatusPill>}
              value={closedRoles}
              muted={closedRoles === 0}
              hint={t("noLongerHiring")}
            />
            <StatTile
              label={<StatusPill tone="accent">{t("candidates")}</StatusPill>}
              value={totalApplicants}
              muted={totalApplicants === 0}
              hint={newApplicants > 0 ? t("newThisWeek", { count: newApplicants }) : t("acrossAllRoles")}
            />
          </section>
        </Card>
      ) : null}

      <div
        role="tablist"
        aria-label={t("view")}
        className="flex w-fit items-center gap-1.5"
      >
        <Tab href="/dashboard/jobs" active={!isTrash}>
          {t("active")}
          <span className="tabular-nums opacity-70">{jobs.length}</span>
        </Tab>
        <Tab href="/dashboard/jobs?view=trash" active={isTrash}>
          <Trash2 className="size-3.5" />
          {t("trash")}
          <span className="tabular-nums opacity-70">{trashed.length}</span>
        </Tab>
      </div>

      {isTrash ? (
        trashed.length > 0 ? (
          <Card className="gap-0 divide-y divide-hairline overflow-hidden py-0">
            {trashed.map((job) => (
              <div key={job.id} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                <JobIdentity title={job.title} department={job.department} location={job.location} deletedAt={job.deletedAt} muted />
                <TrashJobActions jobId={job.id} jobTitle={job.title} />
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState
            icon={Trash2}
            title={t("trashEmptyTitle")}
            description={t("trashEmptyDescription")}
          />
        )
      ) : jobs.length > 0 ? (
        <JobsTable jobs={jobs} />
      ) : (
        <EmptyState
          icon={Briefcase}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={{ href: "/dashboard/jobs/new", label: t("create") }}
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
      role="tab"
      aria-selected={active}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink",
        active
          ? "bg-near-ink text-pure-snow"
          : "bg-soft-kraft text-soft-ink hover:bg-row-wash hover:text-near-ink",
      )}
    >
      {children}
    </Link>
  );
}
