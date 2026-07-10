"use client";

import type { ReactNode } from "react";

import type {
  ApplicationFieldVisibility,
  JobApplicationConfig,
  JobApplicationFieldConfig,
} from "../config";
import { JobQuestionBuilder } from "../JobQuestionBuilder";
import { cn } from "@/lib/utils";

const visibilityOptions: Array<{
  value: ApplicationFieldVisibility;
  label: string;
  description: string;
}> = [
  {
    value: "required",
    label: "Required",
    description: "Candidates must fill this field.",
  },
  {
    value: "optional",
    label: "Optional",
    description: "Show it, but let candidates skip it.",
  },
  {
    value: "disabled",
    label: "Disabled",
    description: "Hide it from the application form.",
  },
];

function VisibilityField({
  name,
  label,
  value,
  description,
}: {
  name: string;
  label: string;
  value: JobApplicationFieldConfig;
  description?: string;
}) {
  return (
    <fieldset className="rounded-lg border bg-muted/30 px-4 py-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      {description ? (
        <p className="mb-3 text-xs text-muted-foreground">{description}</p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-3">
        {visibilityOptions.map((option) => {
          const checked = value.visibility === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer flex-col rounded-md border px-3 py-2 transition",
                checked
                  ? "border-foreground bg-background"
                  : "border-border bg-background/60 hover:border-foreground/40",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                defaultChecked={checked}
                className="sr-only"
              />
              <span className="text-sm font-medium">{option.label}</span>
              <span className="mt-1 text-xs text-muted-foreground">
                {option.description}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function FieldGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function ApplicationSection({
  applicationConfig,
  aiContext,
}: {
  applicationConfig: JobApplicationConfig;
  aiContext?: {
    title: string;
    description: string;
    keywords: string[];
  };
}) {
  return (
    <div className="space-y-6">
      <FieldGroup
        title="Personal information"
        description="Name and email stay required. Configure the additional fields shown in the first section of the application form."
      >
        <VisibilityField
          name="applicationPhoneVisibility"
          label="Phone"
          value={applicationConfig.sections.personal.phone}
        />
        <VisibilityField
          name="applicationAddressVisibility"
          label="Address"
          value={applicationConfig.sections.personal.address}
        />
        <VisibilityField
          name="applicationPhotoVisibility"
          label="Photo"
          value={applicationConfig.sections.personal.photo}
          description="Candidates can upload a profile photo."
        />
        <VisibilityField
          name="applicationHeadlineVisibility"
          label="Headline"
          value={applicationConfig.sections.personal.headline}
          description="Short professional title or summary."
        />
      </FieldGroup>

      <FieldGroup
        title="Profile"
        description="Control resume and profile links."
      >
        <VisibilityField
          name="applicationResumeVisibility"
          label="Resume / CV"
          value={applicationConfig.sections.profile.resume}
          description="Candidates can upload PDF, DOC, or DOCX."
        />
        <VisibilityField
          name="applicationLinkedinVisibility"
          label="LinkedIn"
          value={applicationConfig.sections.profile.linkedinUrl}
        />
        <VisibilityField
          name="applicationGithubVisibility"
          label="GitHub"
          value={applicationConfig.sections.profile.githubUrl}
        />
        <VisibilityField
          name="applicationWebsiteVisibility"
          label="Website / Portfolio"
          value={applicationConfig.sections.profile.websiteUrl}
        />
        <VisibilityField
          name="applicationEducationVisibility"
          label="Education"
          value={applicationConfig.sections.profile.education}
          description="Candidates can add one or more education entries."
        />
        <VisibilityField
          name="applicationExperienceVisibility"
          label="Experience"
          value={applicationConfig.sections.profile.experience}
          description="Candidates can add one or more work experience entries."
        />
      </FieldGroup>

      <FieldGroup
        title="Details"
        description="Additional written context and screening questions."
      >
        <VisibilityField
          name="applicationCoverLetterVisibility"
          label="Cover letter"
          value={applicationConfig.sections.details.coverLetter}
        />
        <div>
          <h3 className="mb-3 text-sm font-semibold">Custom questions</h3>
          <JobQuestionBuilder
            initialQuestions={applicationConfig.questions}
            aiContext={aiContext}
          />
        </div>
      </FieldGroup>
    </div>
  );
}
