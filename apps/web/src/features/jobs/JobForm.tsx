"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Lightbulb } from "lucide-react";
import type { Job } from "@harly/db";

import {
  normalizeJobApplicationConfig,
  parseJobContentSections,
  parseKeywords,
  parseOfficePhotos,
  type JobContentSection,
} from "./config";
import { jobFormSchema } from "./validation";
import type { HiringTeamMember, WorkspaceMemberOption } from "./hiring-team-data";
import { EssentialsSection } from "./sections/EssentialsSection";
import { DescriptionSection } from "./sections/DescriptionSection";
import { CompensationSection } from "./sections/CompensationSection";
import { ApplicationSection } from "./sections/ApplicationSection";
import { AdvancedSection } from "./sections/AdvancedSection";
import { ReviewSection } from "./sections/ReviewSection";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type JobFormProps = {
  action: (formData: FormData) => Promise<void>;
  job?: Job;
  submitLabel: string;
  departments: string[];
  hiringTeam?: HiringTeamMember[];
  workspaceMembers?: WorkspaceMemberOption[];
  aiConfigured?: boolean;
  candidatePoolCount?: number;
};

const GENERIC_SECTIONS: JobContentSection[] = [
  { id: "scaffold-1", title: "Responsibilities", body: "" },
  { id: "scaffold-2", title: "Requirements", body: "" },
  { id: "scaffold-3", title: "Benefits", body: "" },
];

function initialSectionsFor(job?: Job): JobContentSection[] {
  const existing = parseJobContentSections(job?.contentSections);
  if (existing.length > 0) return existing;
  if (job) {
    const migrated: JobContentSection[] = [];
    if (job.requirements) migrated.push({ id: "migrated-req", title: "Requirements", body: job.requirements });
    if (job.benefits) migrated.push({ id: "migrated-ben", title: "Benefits", body: job.benefits });
    return migrated;
  }
  return GENERIC_SECTIONS.map((s) => ({ ...s }));
}

const STEPS = [
  { key: "essentials", label: "Details" },
  { key: "description", label: "Description" },
  { key: "compensation", label: "Compensation" },
  { key: "application", label: "Application form" },
  { key: "advanced", label: "Advanced" },
  { key: "review", label: "Review & publish" },
] as const;

const LAST_STEP = STEPS.length - 1;

type StepKey = (typeof STEPS)[number]["key"];

const TIPS: Record<StepKey, { heading: string; items: string[] }> = {
  essentials: {
    heading: "Writing a strong posting",
    items: [
      'Use a common job title, such as "Backend Engineer", not "Code Ninja". It lifts search visibility.',
      "One role per posting. Hiring two? Create two jobs.",
      "Listing a salary range measurably increases applications.",
    ],
  },
  description: {
    heading: "Describing the role",
    items: [
      "Lead with impact and team, not a wall of requirements.",
      "Use sections and templates so it stays scannable.",
      "Keep must-haves short. Long lists scare off good candidates.",
    ],
  },
  compensation: {
    heading: "Pay transparency",
    items: [
      "Jobs with salary ranges get up to 30% more applicants.",
      "Many jurisdictions now require pay disclosure. Adding it keeps you compliant.",
    ],
  },
  application: {
    heading: "Designing the form",
    items: [
      "Ask only what you’ll actually use to decide.",
      "Every extra required field lowers completion rate.",
      "Make profile links optional. Not everyone has a GitHub.",
    ],
  },
  advanced: {
    heading: "Fine-tuning",
    items: [
      "Keywords improve search on your careers page and future job-board syndication.",
      "A custom slug lets you share cleaner URLs.",
    ],
  },
  review: {
    heading: "Before you publish",
    items: [
      "Double-check the salary range and application fields once more.",
      "Add your hiring team so reviews aren't stuck with you alone.",
      "Preview the listing exactly as candidates will see it.",
    ],
  },
};

const FIELD_TO_SECTION: Record<string, StepKey> = {
  title: "essentials",
  department: "essentials",
  location: "essentials",
  workplaceType: "essentials",
  employmentType: "essentials",
  description: "description",
  contentSectionsJson: "description",
  salaryMin: "compensation",
  salaryMax: "compensation",
  currency: "compensation",
  salaryPeriod: "compensation",
  resumeRequired: "application",
  applicationPhoneVisibility: "application",
  applicationAddressVisibility: "application",
  applicationPhotoVisibility: "application",
  applicationHeadlineVisibility: "application",
  applicationResumeVisibility: "application",
  applicationLinkedinVisibility: "application",
  applicationGithubVisibility: "application",
  applicationWebsiteVisibility: "application",
  applicationEducationVisibility: "application",
  applicationExperienceVisibility: "application",
  applicationCoverLetterVisibility: "application",
  applicationQuestionsJson: "application",
  slug: "advanced",
  experienceLevel: "advanced",
  education: "advanced",
  keywordsJson: "advanced",
  officeAddress: "advanced",
  officePhotosJson: "advanced",
};

function stepIndexForKey(key: StepKey): number {
  const idx = STEPS.findIndex((s) => s.key === key);
  return idx === -1 ? 0 : idx;
}

export function JobForm({
  action,
  job,
  submitLabel,
  departments,
  hiringTeam,
  workspaceMembers,
  aiConfigured,
  candidatePoolCount,
}: JobFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const applicationConfig = normalizeJobApplicationConfig(job?.applicationConfig);

  const [title, setTitle] = useState(job?.title ?? "");
  const [titleError, setTitleError] = useState(false);
  const [workplace, setWorkplace] = useState<string>(job?.workplaceType ?? "remote");

  const [description, setDescription] = useState(
    job?.description ?? "<p>Describe the role, the team, and the impact this person will have.</p>",
  );
  const [sections, setSections] = useState<JobContentSection[]>(() => initialSectionsFor(job));
  const [keywords, setKeywords] = useState<string[]>(() => parseKeywords(job?.keywords));
  const [photos, setPhotos] = useState<string[]>(() => parseOfficePhotos(job?.officePhotos));
  const [descriptionVersion, setDescriptionVersion] = useState(0);
  const [aiPending, startAi] = useTransition();

  // A published job already has every section filled in , land on Review
  // instead of Details, and treat the earlier steps as done regardless of
  // where the user is currently browsing (see `StepBar` below).
  const isPublished = job?.status === "open";

  // Step wizard state , all step content stays mounted (visibility toggled via
  // `hidden`) so uncontrolled native inputs (slug, salaryMin/Max, etc.) never
  // lose their value when the user navigates away and back.
  const [step, setStep] = useState(isPublished ? LAST_STEP : 0);

  // Step 6's PublicJobPreview (live iframe) and SemanticMatchPanel (AI cost
  // surface) should not mount until the user actually reaches Review , but
  // once they have, keep them mounted (same always-mounted rule as every
  // other step) so their internal state survives navigating away and back.
  // Set inside the one shared navigation handler below (an event handler,
  // not render or an effect) , every step change goes through `goToStep`.
  const [reviewVisited, setReviewVisited] = useState(step === LAST_STEP);

  function goToStep(index: number) {
    setStep(index);
    if (index === LAST_STEP) setReviewVisited(true);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function goNext() {
    if (step === 0 && title.trim().length < 3) {
      setTitleError(true);
      toast.error("Add a job title (at least 3 characters) to continue.");
      return;
    }
    goToStep(Math.min(step + 1, LAST_STEP));
  }

  function goBack() {
    goToStep(Math.max(step - 1, 0));
  }

  const tip = TIPS[STEPS[step].key];

  // Validation
  const validateBeforeSubmit = useCallback(
    (event: React.MouseEvent) => {
      if (!formRef.current) return;

      const fd = new FormData(formRef.current);
      const result = jobFormSchema.safeParse({
        title: fd.get("title"),
        slug: fd.get("slug"),
        department: fd.get("department"),
        location: fd.get("location"),
        employmentType: fd.get("employmentType"),
        workplaceType: fd.get("workplaceType"),
        experienceLevel: fd.get("experienceLevel"),
        education: fd.get("education"),
        keywordsJson: fd.get("keywordsJson"),
        description: fd.get("description"),
        contentSectionsJson: fd.get("contentSectionsJson"),
        salaryMin: fd.get("salaryMin"),
        salaryMax: fd.get("salaryMax"),
        currency: fd.get("currency"),
        salaryPeriod: fd.get("salaryPeriod"),
        officeAddress: fd.get("officeAddress"),
        officePhotosJson: fd.get("officePhotosJson"),
        applicationPhoneVisibility: fd.get("applicationPhoneVisibility"),
        applicationAddressVisibility: fd.get("applicationAddressVisibility"),
        applicationPhotoVisibility: fd.get("applicationPhotoVisibility"),
        applicationHeadlineVisibility: fd.get("applicationHeadlineVisibility"),
        applicationResumeVisibility: fd.get("applicationResumeVisibility"),
        applicationLinkedinVisibility: fd.get("applicationLinkedinVisibility"),
        applicationGithubVisibility: fd.get("applicationGithubVisibility"),
        applicationWebsiteVisibility: fd.get("applicationWebsiteVisibility"),
        applicationEducationVisibility: fd.get("applicationEducationVisibility"),
        applicationExperienceVisibility: fd.get("applicationExperienceVisibility"),
        applicationCoverLetterVisibility: fd.get("applicationCoverLetterVisibility"),
        applicationQuestionsJson: fd.get("applicationQuestionsJson"),
      });

      if (result.success) return;

      event.preventDefault();
      const issue = result.error.issues[0];
      if (!issue) return;

      toast.error(issue.message);

      const fieldName = String(issue.path[0] ?? "");
      const sectionKey = FIELD_TO_SECTION[fieldName] ?? "essentials";
      goToStep(stepIndexForKey(sectionKey));

      if (fieldName === "title") {
        setTitleError(true);
      }
    },
    [],
  );

  return (
    <form ref={formRef} action={action} className="relative">
      {job ? <input type="hidden" name="jobId" value={job.id} /> : null}
      <input type="hidden" name="contentSectionsJson" value={JSON.stringify(sections)} />
      <input type="hidden" name="keywordsJson" value={JSON.stringify(keywords)} />
      <input type="hidden" name="officePhotosJson" value={JSON.stringify(photos)} />

      {/* Sticky header + step rail */}
      <div className="sticky top-0 z-20 -mx-4 border-b bg-background/90 px-4 py-2.5 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium text-muted-foreground">
            {title || "New job"}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="submit"
              name="intent"
              value="draft"
              variant="ghost"
              size="sm"
              onClick={validateBeforeSubmit}
            >
              Save as draft
            </Button>
            {step === LAST_STEP ? (
              <Button
                type="submit"
                name="intent"
                value="continue"
                size="sm"
                onClick={validateBeforeSubmit}
              >
                {submitLabel}
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={goNext}>
                Continue
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2.5 overflow-x-auto">
          <StepBar steps={STEPS} current={step} onSelect={goToStep} allDone={isPublished} />
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        {/* Main column */}
        <div className="min-w-0 space-y-5">
          {/*
            Every step below stays mounted for the lifetime of the form.
            Only `hidden`/`block` toggles, never a conditional render, so
            uncontrolled native inputs (slug, salaryMin/Max, etc.) never lose
            their value when the user navigates away and back. The `fadeUp`
            animation still replays on each step change for free: browsers
            restart CSS animations when an element goes from `display: none`
            back to visible, so no remount (and no `key`) is needed here.
          */}
          <div className="space-y-5">
            <div
              className={cn(step === 0 ? "block" : "hidden")}
              style={step === 0 ? { animation: "fadeUp 220ms cubic-bezier(0.23,1,0.32,1) both" } : undefined}
            >
              <div className="rounded-2xl border border-border/70 bg-card p-5">
                <EssentialsSection
                  job={job}
                  departments={departments}
                  title={title}
                  setTitle={setTitle}
                  titleError={titleError}
                  setTitleError={setTitleError}
                  workplace={workplace}
                  setWorkplace={setWorkplace}
                />
              </div>
            </div>

            <div
              className={cn(step === 1 ? "block" : "hidden")}
              style={step === 1 ? { animation: "fadeUp 220ms cubic-bezier(0.23,1,0.32,1) both" } : undefined}
            >
              <DescriptionSection
                job={job}
                description={description}
                setDescription={setDescription}
                descriptionVersion={descriptionVersion}
                setDescriptionVersion={setDescriptionVersion}
                sections={sections}
                setSections={setSections}
                title={title}
                keywords={keywords}
                aiPending={aiPending}
                startAi={startAi}
              />
            </div>

            <div
              className={cn(step === 2 ? "block" : "hidden")}
              style={step === 2 ? { animation: "fadeUp 220ms cubic-bezier(0.23,1,0.32,1) both" } : undefined}
            >
              <div className="rounded-2xl border border-border/70 bg-card p-5">
                <CompensationSection job={job} />
              </div>
            </div>

            <div
              className={cn(step === 3 ? "block" : "hidden")}
              style={step === 3 ? { animation: "fadeUp 220ms cubic-bezier(0.23,1,0.32,1) both" } : undefined}
            >
              <div className="rounded-2xl border border-border/70 bg-card p-5">
                <ApplicationSection
                  applicationConfig={applicationConfig}
                  aiContext={{ title, description, keywords }}
                />
              </div>
            </div>

            <div
              className={cn(step === 4 ? "block" : "hidden")}
              style={step === 4 ? { animation: "fadeUp 220ms cubic-bezier(0.23,1,0.32,1) both" } : undefined}
            >
              <div className="rounded-2xl border border-border/70 bg-card p-5">
                <AdvancedSection
                  job={job}
                  workplace={workplace}
                  keywords={keywords}
                  setKeywords={setKeywords}
                  photos={photos}
                  setPhotos={setPhotos}
                />
              </div>
            </div>

            <div
              className={cn(step === LAST_STEP ? "block" : "hidden")}
              style={step === LAST_STEP ? { animation: "fadeUp 220ms cubic-bezier(0.23,1,0.32,1) both" } : undefined}
            >
              <ReviewSection
                job={job}
                title={title}
                workplace={workplace}
                submitLabel={submitLabel}
                reviewVisited={reviewVisited}
                hiringTeam={hiringTeam}
                workspaceMembers={workspaceMembers}
                aiConfigured={aiConfigured}
                candidatePoolCount={candidatePoolCount}
              />
            </div>
          </div>

          {/* Footer nav */}
          <div className="flex items-center justify-between pt-1">
            {step > 0 ? (
              <Button type="button" variant="ghost" onClick={goBack}>
                Back
              </Button>
            ) : (
              <span />
            )}
            {step === LAST_STEP ? (
              <Button
                type="submit"
                name="intent"
                value="continue"
                onClick={validateBeforeSubmit}
              >
                {submitLabel}
              </Button>
            ) : (
              <Button type="button" onClick={goNext}>
                Continue
              </Button>
            )}
          </div>
        </div>

        {/* Tips sidebar */}
        <aside className="hidden h-fit lg:sticky lg:top-24 lg:block">
          <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Lightbulb className="size-3.5 text-primary" strokeWidth={2} />
              {tip.heading}
            </p>
            <ul className="space-y-2.5">
              {tip.items.map((item, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-snug text-muted-foreground">
                  <Check className="mt-0.5 size-3 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/*  Step rail                                                         */
/* ------------------------------------------------------------------ */

function StepBar({
  steps,
  current,
  onSelect,
  allDone = false,
}: {
  steps: typeof STEPS;
  current: number;
  onSelect: (index: number) => void;
  /** Published jobs already have every section filled in , show every step
   * (besides Review itself) as done regardless of where the user is
   * currently browsing, instead of the usual "done = already passed". */
  allDone?: boolean;
}) {
  return (
    <nav className="flex items-center gap-1.5">
      {steps.map((s, index) => {
        const done = allDone ? index < steps.length - 1 : index < current;
        const active = index === current;
        return (
          <div key={s.key} className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSelect(index)}
              className="flex items-center gap-1.5 rounded-full py-1 pr-1 transition-colors"
              aria-current={active ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors",
                  done && "bg-primary text-primary-foreground",
                  active && "bg-primary text-primary-foreground ring-2 ring-sage ring-offset-1 ring-offset-background",
                  !done && !active && "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : index + 1}
              </span>
              <span
                className={cn(
                  "hidden text-xs font-medium sm:inline",
                  done || active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
            </button>
            {index < steps.length - 1 ? <span className="h-px w-4 shrink-0 bg-border" /> : null}
          </div>
        );
      })}
    </nav>
  );
}
