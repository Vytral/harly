"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import type {
  ApplicationFieldVisibility,
  JobApplicationConfig,
  JobApplicationFieldConfig,
} from "../config";
import { JobQuestionBuilder } from "../JobQuestionBuilder";
import { cn } from "@/lib/utils";

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
  const t = useTranslations("jobs.application");
  const visibilityOptions: Array<{ value: ApplicationFieldVisibility; label: string; description: string }> = [
    { value: "required", label: t("required"), description: t("requiredDescription") },
    { value: "optional", label: t("optional"), description: t("optionalDescription") },
    { value: "disabled", label: t("disabled"), description: t("disabledDescription") },
  ];
  const [selected, setSelected] = useState<ApplicationFieldVisibility>(
    value.visibility,
  );

  return (
    <fieldset className="rounded-lg border border-input bg-card px-3.5 pt-2 pb-3">
      <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        {label}
      </legend>
      {description ? (
        <p className="mb-3 text-xs text-muted-foreground">{description}</p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-3">
        {visibilityOptions.map((option) => {
          const checked = selected === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer flex-col rounded-md border px-3 py-2 transition-colors duration-150",
                checked
                  ? "border-near-ink bg-lime-wash"
                  : "border-hairline bg-card-inset hover:border-mist-border",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => setSelected(option.value)}
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
  const t = useTranslations("jobs.application");
  return (
    <div className="space-y-6">
      <FieldGroup
        title={t("personalInformation")}
        description={t("personalDescription")}
      >
        <VisibilityField
          name="applicationPhoneVisibility"
          label={t("phone")}
          value={applicationConfig.sections.personal.phone}
        />
        <VisibilityField
          name="applicationAddressVisibility"
          label={t("address")}
          value={applicationConfig.sections.personal.address}
        />
        <VisibilityField
          name="applicationPhotoVisibility"
          label={t("photo")}
          value={applicationConfig.sections.personal.photo}
          description={t("photoDescription")}
        />
        <VisibilityField
          name="applicationHeadlineVisibility"
          label={t("headline")}
          value={applicationConfig.sections.personal.headline}
          description={t("headlineDescription")}
        />
      </FieldGroup>

      <FieldGroup
        title={t("profile")}
        description={t("profileDescription")}
      >
        <VisibilityField
          name="applicationResumeVisibility"
          label={t("resume")}
          value={applicationConfig.sections.profile.resume}
          description={t("resumeDescription")}
        />
        <VisibilityField
          name="applicationLinkedinVisibility"
          label={t("linkedin")}
          value={applicationConfig.sections.profile.linkedinUrl}
        />
        <VisibilityField
          name="applicationGithubVisibility"
          label={t("github")}
          value={applicationConfig.sections.profile.githubUrl}
        />
        <VisibilityField
          name="applicationWebsiteVisibility"
          label={t("website")}
          value={applicationConfig.sections.profile.websiteUrl}
        />
        <VisibilityField
          name="applicationEducationVisibility"
          label={t("education")}
          value={applicationConfig.sections.profile.education}
          description={t("educationDescription")}
        />
        <VisibilityField
          name="applicationExperienceVisibility"
          label={t("experience")}
          value={applicationConfig.sections.profile.experience}
          description={t("experienceDescription")}
        />
      </FieldGroup>

      <FieldGroup
        title={t("details")}
        description={t("detailsDescription")}
      >
        <VisibilityField
          name="applicationCoverLetterVisibility"
          label={t("coverLetter")}
          value={applicationConfig.sections.details.coverLetter}
        />
        <div>
          <h3 className="mb-3 text-sm font-semibold">{t("customContent")}</h3>
          <JobQuestionBuilder
            initialQuestions={applicationConfig.questions}
            aiContext={aiContext}
          />
        </div>
      </FieldGroup>
    </div>
  );
}
