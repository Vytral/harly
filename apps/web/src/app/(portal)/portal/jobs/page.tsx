import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { desc, eq, and } from "drizzle-orm";
import type { Route } from "next";

import { db, jobs, organization } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { PortalShell } from "@/features/portal/PortalShell";
import { formatShort } from "@/lib/date";

export const dynamic = "force-dynamic";

const WORKPLACE_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
};

export default async function PortalJobsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) redirect("/portal/login" as Route);

  const session = await resolvePortalSession(token);
  if (!session) redirect("/portal/login" as Route);

  const openJobs = await db
    .select({
      id: jobs.id,
      slug: jobs.slug,
      title: jobs.title,
      department: jobs.department,
      location: jobs.location,
      workplaceType: jobs.workplaceType,
      employmentType: jobs.employmentType,
      publishedAt: jobs.publishedAt,
    })
    .from(jobs)
    .where(
      and(
        eq(jobs.workspaceId, session.workspaceId),
        eq(jobs.status, "open"),
      ),
    )
    .orderBy(desc(jobs.publishedAt));

  return (
    <PortalShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Open roles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {openJobs.length} open position{openJobs.length === 1 ? "" : "s"}
          </p>
        </div>

        {openJobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/30 p-10 text-center">
            <p className="text-sm text-muted-foreground">No open roles right now. Check back soon.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {openJobs.map((job) => (
              <a
                key={job.id}
                href={`/jobs/${job.slug}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4 transition-all hover:border-foreground/20 hover:bg-accent/30"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{job.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[job.department, job.location].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {WORKPLACE_LABELS[job.workplaceType ?? ""] ?? job.workplaceType}
                  </span>
                  {job.employmentType ? (
                    <span className="text-[11px] text-muted-foreground">
                      {EMPLOYMENT_LABELS[job.employmentType] ?? job.employmentType}
                    </span>
                  ) : null}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
