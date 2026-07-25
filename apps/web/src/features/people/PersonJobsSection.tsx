import Link from "next/link";
import type { Route } from "next";
import { Briefcase } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PersonJobRow } from "@/features/people/actions";

const ROLE_LABELS: Record<string, string> = {
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
  interviewer: "Interviewer",
};

export function PersonJobsSection({ jobs }: { jobs: PersonJobRow[] }) {
  if (jobs.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Briefcase className="size-3.5" />
          Jobs & hiring teams
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border/60 p-0">
        {jobs.map((job) => (
          <Link
            key={job.id}
            href={`/dashboard/jobs/${job.id}` as Route}
            className="flex items-center justify-between gap-3 px-6 py-3 text-sm outline-offset-[-2px] hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span className="min-w-0 truncate font-medium">{job.title}</span>
            <Badge variant="outline" className="shrink-0">
              {ROLE_LABELS[job.role] ?? job.role}
            </Badge>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
