"use client";

import {
  CalendarClock,
  ClipboardCheck,
  FileText,
  Mail,
  Pencil,
} from "lucide-react";

import {
  EditCandidateDrawer,
  type EditableCandidate,
} from "@/features/candidates/EditCandidateDrawer";
import { EmailDrawer } from "@/features/candidates/EmailDrawer";
import { EvaluationDrawer } from "@/features/candidates/EvaluationDrawer";
import {
  ScheduleDrawer,
  type ScheduleApplicationOption,
  type ScheduleCalConfig,
  type ScheduleMemberOption,
} from "@/features/candidates/ScheduleDrawer";
import { Button } from "@/components/ui/button";

export function CandidateActionBar({
  candidate,
  name,
  resumeUrl,
  stageName,
  applications,
  members,
  cal,
}: {
  candidate: EditableCandidate;
  name: string;
  resumeUrl: string | null;
  stageName: string | null;
  applications: ScheduleApplicationOption[];
  members: ScheduleMemberOption[];
  cal: ScheduleCalConfig;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <EvaluationDrawer
        candidateId={candidate.id}
        workspaceId={candidate.workspaceId}
        stageName={stageName}
        trigger={
          <Button size="sm">
            <ClipboardCheck className="size-4" />
            Evaluate
          </Button>
        }
      />
      <EmailDrawer
        candidateId={candidate.id}
        workspaceId={candidate.workspaceId}
        email={candidate.email}
        name={name}
        trigger={
          <Button size="sm" variant="outline">
            <Mail className="size-4" />
            Email
          </Button>
        }
      />
      <ScheduleDrawer
        candidateId={candidate.id}
        workspaceId={candidate.workspaceId}
        candidateName={name}
        candidateEmail={candidate.email}
        applications={applications}
        members={members}
        cal={cal}
        trigger={
          <Button size="sm" variant="outline">
            <CalendarClock className="size-4" />
            Schedule
          </Button>
        }
      />
      <EditCandidateDrawer
        candidate={candidate}
        trigger={
          <Button size="sm" variant="outline">
            <Pencil className="size-4" />
            Edit
          </Button>
        }
      />
      {resumeUrl ? (
        <Button asChild size="sm" variant="outline">
          <a href={resumeUrl} target="_blank" rel="noreferrer">
            <FileText className="size-4" />
            Resume
          </a>
        </Button>
      ) : null}
    </div>
  );
}
