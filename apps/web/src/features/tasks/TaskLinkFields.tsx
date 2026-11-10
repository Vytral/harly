"use client";

import { Briefcase, Calendar, Link2, User } from "lucide-react";
import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

/** Radix Select cannot use an empty string as an item value. */
const NONE = "none";

function FieldLabel({ icon: Icon, children, htmlFor }: { icon: typeof User; children: React.ReactNode; htmlFor: string }) {
  return (
    <Label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] font-medium text-soft-ink">
      <Icon className="mr-1 inline size-3" aria-hidden="true" />
      {children}
    </Label>
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
  const t = useTranslations("features.tasks.taskLinkFields");
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
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-soft-ink">
        <Link2 className="size-3.5" aria-hidden="true" />
        {t("recruitingContext")}
      </div>

      <div>
        <FieldLabel icon={User} htmlFor="task-candidate">
          {t("candidate")}
        </FieldLabel>
        <Select
          value={value.candidateId ?? NONE}
          onValueChange={(next) =>
            onChange({
              candidateId: next === NONE ? null : next,
              applicationId: null,
              jobId: null,
              interviewId: null,
            })
          }
        >
          <SelectTrigger id="task-candidate" className="w-full">
            <SelectValue placeholder={t("noCandidateLinked")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("noCandidateLinked")}</SelectItem>
            {options.candidates.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.firstName} {candidate.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <FieldLabel icon={Link2} htmlFor="task-application">
          {t("application")}
        </FieldLabel>
        <Select
          value={value.applicationId ?? NONE}
          disabled={!value.candidateId}
          onValueChange={(next) => {
            const application = applications.find((item) => item.id === next);
            onChange({
              ...value,
              applicationId: application?.id ?? null,
              jobId: application?.jobId ?? value.jobId,
              interviewId: null,
            });
          }}
        >
          <SelectTrigger id="task-application" className="w-full">
            <SelectValue
              placeholder={value.candidateId ? t("noApplicationLinked") : t("selectCandidateFirst")}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("noApplicationLinked")}</SelectItem>
            {applications.map((application) => (
              <SelectItem key={application.id} value={application.id}>
                {application.jobTitle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <FieldLabel icon={Briefcase} htmlFor="task-job">
          {t("job")}
        </FieldLabel>
        <Select
          value={value.jobId ?? NONE}
          disabled={Boolean(selectedApplication)}
          onValueChange={(next) =>
            onChange({ ...value, jobId: next === NONE ? null : next, interviewId: null })
          }
        >
          <SelectTrigger id="task-job" className="w-full">
            <SelectValue placeholder={t("noJobLinked")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("noJobLinked")}</SelectItem>
            {options.jobs.map((job) => (
              <SelectItem key={job.id} value={job.id}>
                {job.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedApplication ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("derivedFromApplication")}
          </p>
        ) : null}
      </div>

      <div>
        <FieldLabel icon={Calendar} htmlFor="task-interview">
          {t("interview")}
        </FieldLabel>
        <Select
          value={value.interviewId ?? NONE}
          disabled={!value.candidateId}
          onValueChange={(next) =>
            onChange({ ...value, interviewId: next === NONE ? null : next })
          }
        >
          <SelectTrigger id="task-interview" className="w-full">
            <SelectValue
              placeholder={value.candidateId ? t("noInterviewLinked") : t("selectCandidateFirst")}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t("noInterviewLinked")}</SelectItem>
            {interviews.map((interview) => (
              <SelectItem key={interview.id} value={interview.id}>
                {interview.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
