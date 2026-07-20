"use client";

import { Briefcase, Calendar, Link2, User } from "lucide-react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type {
  TaskApplicationOption,
  TaskCandidateOption,
  TaskInterviewOption,
  TaskJobOption,
} from "./data";

export type TaskLinkValues = {
  candidateId: string | null;
  applicationId: string | null;
  jobId: string | null;
  interviewId: string | null;
};

export type TaskContextOptions = {
  candidates: TaskCandidateOption[];
  applications: TaskApplicationOption[];
  interviews: TaskInterviewOption[];
  jobs: TaskJobOption[];
};

function FieldLabel({ icon: Icon, children, htmlFor }: { icon: typeof User; children: React.ReactNode; htmlFor: string }) {
  return (
    <Label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-zinc-500">
      <Icon className="mr-1 inline size-3" />
      {children}
    </Label>
  );
}

function selectClassName(disabled: boolean) {
  return cn(
    "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
    disabled && "cursor-not-allowed opacity-60",
  );
}

export function TaskLinkFields({
  value,
  options,
  onChange,
}: {
  value: TaskLinkValues;
  options: TaskContextOptions;
  onChange: (value: TaskLinkValues) => void;
}) {
  const applications = options.applications.filter(
    (application) => !value.candidateId || application.candidateId === value.candidateId,
  );
  const interviews = options.interviews.filter(
    (interview) =>
      (!value.candidateId || interview.candidateId === value.candidateId) &&
      (!value.applicationId || interview.applicationId === value.applicationId),
  );
  const selectedApplication = options.applications.find(
    (application) => application.id === value.applicationId,
  );

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Link2 className="size-3.5" />
        Recruiting context
      </div>

      <div>
        <FieldLabel icon={User} htmlFor="task-candidate">
          Candidate
        </FieldLabel>
        <select
          id="task-candidate"
          value={value.candidateId ?? ""}
          onChange={(event) =>
            onChange({
              candidateId: event.target.value || null,
              applicationId: null,
              jobId: null,
              interviewId: null,
            })
          }
          className={selectClassName(false)}
        >
          <option value="">No candidate linked</option>
          {options.candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.firstName} {candidate.lastName}
            </option>
          ))}
        </select>
      </div>

      <div>
        <FieldLabel icon={Link2} htmlFor="task-application">
          Application
        </FieldLabel>
        <select
          id="task-application"
          value={value.applicationId ?? ""}
          disabled={!value.candidateId}
          onChange={(event) => {
            const application = applications.find((item) => item.id === event.target.value);
            onChange({
              ...value,
              applicationId: application?.id ?? null,
              jobId: application?.jobId ?? value.jobId,
              interviewId: null,
            });
          }}
          className={selectClassName(!value.candidateId)}
        >
          <option value="">
            {value.candidateId ? "No application linked" : "Select a candidate first"}
          </option>
          {applications.map((application) => (
            <option key={application.id} value={application.id}>
              {application.jobTitle}
            </option>
          ))}
        </select>
      </div>

      <div>
        <FieldLabel icon={Briefcase} htmlFor="task-job">
          Job
        </FieldLabel>
        <select
          id="task-job"
          value={value.jobId ?? ""}
          disabled={Boolean(selectedApplication)}
          onChange={(event) => onChange({ ...value, jobId: event.target.value || null, interviewId: null })}
          className={selectClassName(Boolean(selectedApplication))}
        >
          <option value="">No job linked</option>
          {options.jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
            </option>
          ))}
        </select>
        {selectedApplication ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Derived from the selected application.
          </p>
        ) : null}
      </div>

      <div>
        <FieldLabel icon={Calendar} htmlFor="task-interview">
          Interview
        </FieldLabel>
        <select
          id="task-interview"
          value={value.interviewId ?? ""}
          disabled={!value.candidateId}
          onChange={(event) => onChange({ ...value, interviewId: event.target.value || null })}
          className={selectClassName(!value.candidateId)}
        >
          <option value="">
            {value.candidateId ? "No interview linked" : "Select a candidate first"}
          </option>
          {interviews.map((interview) => (
            <option key={interview.id} value={interview.id}>
              {interview.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
