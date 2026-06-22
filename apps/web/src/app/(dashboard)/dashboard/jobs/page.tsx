import Link from "next/link";
import type { Route } from "next";
import { Briefcase, MapPin, Plus, TrendingUp, Trash2, Users } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { JobStatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatEmploymentType,
  formatWorkplaceType,
  listJobsWithStats,
  listTrashedJobs,
} from "@/features/jobs/data";
import { JobActionsMenu } from "@/features/jobs/JobActionsMenu";
import { TrashJobActions } from "@/features/jobs/TrashJobActions";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/date";

export const dynamic = "force-dynamic";

type JobsPageProps = {
  searchParams: Promise<{ view?: string }>;
};

const tileClass =
  "rounded-2xl border border-border/70 bg-card p-4 shadow-[0_1px_2px_rgba(28,27,22,0.04)]";

export default async function DashboardJobsPage({ searchParams }: JobsPageProps) {
  const { view } = await searchParams;
  const isTrash = view === "trash";

  const [jobs, trashed] = await Promise.all([
    listJobsWithStats(),
    listTrashedJobs(),
  ]);

  const openRoles = jobs.filter((j) => j.status === "open").length;
  const draftRoles = jobs.filter((j) => j.status === "draft").length;
  const totalApplicants = jobs.reduce((sum, j) => sum + j.applicants, 0);
  const newApplicants = jobs.reduce((sum, j) => sum + j.newApplicants, 0);
  const maxApplicants = Math.max(1, ...jobs.map((j) => j.applicants));

  return (
    <div className="space-y-5">
      {!isTrash && jobs.length > 0 ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="duration-500 animate-in fade-in slide-in-from-bottom-2">
            <StatTile label="Open roles" value={openRoles} hint={`${draftRoles} draft`} icon={Briefcase} />
          </div>
          <div className="delay-75 duration-500 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards">
            <StatTile label="Applicants" value={totalApplicants} hint="across all roles" icon={Users} />
          </div>
          <div className="delay-150 duration-500 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards">
            <StatTile label="New this week" value={newApplicants} hint="applied in 7d" icon={TrendingUp} accent />
          </div>
          <div className="delay-200 duration-500 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards">
            <StatTile label="Total roles" value={jobs.length} hint={`${draftRoles} not published`} icon={Briefcase} />
          </div>
        </section>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div className="flex w-fit items-center gap-1 rounded-lg border bg-card p-1 text-sm">
          <Tab href="/dashboard/jobs" active={!isTrash}>
            Active
            <span className="ml-1.5 tabular-nums text-muted-foreground">{jobs.length}</span>
          </Tab>
          <Tab href="/dashboard/jobs?view=trash" active={isTrash}>
            <Trash2 className="size-3.5" />
            Trash
            <span className="ml-1.5 tabular-nums text-muted-foreground">{trashed.length}</span>
          </Tab>
        </div>
        <Button asChild size="sm">
          <Link href="/dashboard/jobs/new">
            <Plus className="size-4" />
            New job
          </Link>
        </Button>
      </div>

      {isTrash ? (
        trashed.length > 0 ? (
          <Card className="gap-0 divide-y divide-border/60 overflow-hidden py-0">
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
            title="Trash is empty"
            description="Jobs you move to the trash show up here and can be restored."
          />
        )
      ) : jobs.length > 0 ? (
        <Card className="gap-0 divide-y divide-border/60 overflow-hidden py-0">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_10rem_9rem_auto] sm:px-5"
            >
              <Link href={`/dashboard/jobs/${job.id}` as Route} className="min-w-0">
                <JobIdentity title={job.title} department={job.department} location={job.location} />
              </Link>

              <div className="hidden text-xs text-muted-foreground sm:block">
                {formatEmploymentType(job.employmentType)}
                <span className="mx-1 text-border">·</span>
                {formatWorkplaceType(job.workplaceType)}
              </div>

              {/* Applicants — count + mini bar (the "graph") */}
              <div className="hidden min-w-0 sm:block">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold tabular-nums">{job.applicants}</span>
                  {job.newApplicants > 0 ? (
                    <span className="text-[0.65rem] font-medium text-primary">+{job.newApplicants} new</span>
                  ) : null}
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${(job.applicants / maxApplicants) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-[0.65rem] text-muted-foreground">
                  {job.applicants === 1 ? "Candidate" : "Candidates"}
                  {job.activeApplicants > 0 ? ` · ${job.activeApplicants} active` : ""}
                </p>
              </div>

              <div className="col-start-2 row-start-1 flex items-center justify-end gap-2 sm:col-auto sm:row-auto">
                <JobStatusBadge status={job.status} />
                <JobActionsMenu jobId={job.id} slug={job.slug} />
              </div>
            </div>
          ))}
        </Card>
      ) : (
        <EmptyState
          icon={Briefcase}
          title="No jobs yet"
          description="Create your first opening — Harly adds the default hiring stages automatically."
          action={{ href: "/dashboard/jobs/new", label: "Create job" }}
        />
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof Briefcase;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        tileClass,
        "transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md",
        accent && "border-primary/25 bg-accent/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-lg transition-colors duration-200",
            accent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground/70",
          )}
        >
          <Icon className="size-4" strokeWidth={1.8} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
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

function JobIdentity({
  title,
  department,
  location,
  deletedAt,
  muted = false,
}: {
  title: string;
  department: string | null;
  location: string | null;
  deletedAt?: Date | null;
  muted?: boolean;
}) {
  return (
    <span className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Briefcase className="size-4" />
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block truncate font-medium",
            muted ? "text-muted-foreground" : "text-foreground group-hover:text-primary",
          )}
        >
          {title}
        </span>
        <span className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
          {deletedAt ? (
            <>Deleted {formatRelative(deletedAt)}</>
          ) : location ? (
            <>
              <MapPin className="size-3 shrink-0" />
              {[department, location].filter(Boolean).join(" · ")}
            </>
          ) : (
            (department ?? "No location set")
          )}
        </span>
      </span>
    </span>
  );
}
