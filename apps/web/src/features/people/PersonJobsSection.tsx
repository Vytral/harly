import Link from "next/link";
import type { Route } from "next";
import { Briefcase, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PersonJobRow } from "@/features/people/actions";

const ROLE_KEYS: Record<string, "recruiter" | "hiringManager" | "interviewer"> = {
  recruiter: "recruiter",
  hiring_manager: "hiringManager",
  interviewer: "interviewer",
};

export async function PersonJobsSection({ jobs }: { jobs: PersonJobRow[] }) {
  if (jobs.length === 0) return null;

  const t = await getTranslations("features.people.personJobsSection");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {jobs.map((job) => {
          const roleKey = ROLE_KEYS[job.role];
          return (
            <Link
              key={job.id}
              href={`/dashboard/jobs/${job.id}` as Route}
              className="group flex items-center gap-3 rounded-[var(--radius-inner)] bg-card-inset px-4 py-3 text-sm transition-colors hover:bg-row-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-ink"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-btn)] border border-hairline bg-pure-snow">
                <Briefcase className="size-4" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-near-ink">{job.title}</span>
                <span className="block text-[12.5px] text-soft-ink">
                  {roleKey ? t(`roles.${roleKey}`) : job.role}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-quiet-mist transition-transform group-hover:translate-x-0.5" />
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
