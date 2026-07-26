"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type { Job } from "@harly/db";

import {
  normalizeJobApplicationConfig,
  parseJobContentSections,
  parseKeywords,
  parseOfficePhotos,
  type JobContentSection,
} from "./config";
import { jobFormSchema } from "./validation";
import type {
  HiringTeamMember,
  WorkspaceMemberOption,
} from "./hiring-team-data";
import { EssentialsSection } from "./sections/EssentialsSection";
import { DescriptionSection } from "./sections/DescriptionSection";
import { CompensationSection } from "./sections/CompensationSection";
import { ApplicationSection } from "./sections/ApplicationSection";
import { AdvancedSection } from "./sections/AdvancedSection";
import { ReviewSection } from "./sections/ReviewSection";
import { JobEditorTopBar } from "./JobEditorTopBar";
import { JobEditorRail, type EditorRailSection } from "./JobEditorRail";
import { JobLivePreview, type PreviewJobDraft } from "./JobLivePreview";
import { FocusModeShell } from "@/components/focus-mode/FocusModeShell";
import { useUnsavedChangesGuard } from "@/components/focus-mode/useUnsavedChangesGuard";
import { UnsavedChangesDialog } from "@/components/focus-mode/UnsavedChangesDialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CareerPageConfig } from "@/features/career-page/config";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";

type JobFormProps = {
  action: (formData: FormData) => Promise<void>;
  job?: Job;
  submitLabel: string;
  departments: string[];
  hiringTeam?: HiringTeamMember[];
  workspaceMembers?: WorkspaceMemberOption[];
  aiConfigured?: boolean;
  candidatePoolCount?: number;
  eyebrow?: string;
  statusBadge?: ReactNode;
  headerActions?: ReactNode;
  /** View job / Share job / status actions , rendered in the editor rail
   *  (desktop) and behind the title (mobile/tablet) instead of the top bar. */
  railActions?: ReactNode;
  previewWorkspace?: (WorkspaceBoardBranding & { id: string }) | null;
  previewConfig?: CareerPageConfig | null;
};

function initialSectionsFor(job?: Job): JobContentSection[] {
  const existing = parseJobContentSections(job?.contentSections);
  if (existing.length > 0) return existing;
  if (job) {
    const migrated: JobContentSection[] = [];
    if (job.requirements)
      migrated.push({
        id: "migrated-req",
        title: "Requirements",
        body: job.requirements,
      });
    if (job.benefits)
      migrated.push({
        id: "migrated-ben",
        title: "Benefits",
        body: job.benefits,
      });
    return migrated;
  }
  // New jobs start with just the main description , no pre-seeded empty
  // Responsibilities/Requirements/Benefits editors (three empty rich-text
  // boxes was ~700px of dead space on every new job). "Add section" below
  // the editor still lets the user add them when they actually want to.
  return [];
}

const SECTIONS = [
  {
    key: "essentials",
    label: "Details",
    blurb: "Use a common, searchable job title. One role per posting.",
  },
  {
    key: "description",
    label: "Description",
    blurb: "Lead with impact and team. Keep must-haves short and scannable.",
  },
  {
    key: "compensation",
    label: "Compensation",
    blurb: "Listing a salary range measurably increases applications.",
  },
  {
    key: "application",
    label: "Application form",
    blurb:
      "Ask only what you'll actually use to decide , fewer required fields, more completions.",
  },
  {
    key: "advanced",
    label: "Advanced",
    blurb:
      "Keywords improve search on your careers page. A custom slug keeps URLs clean.",
  },
  {
    key: "review",
    label: "Team & publish",
    blurb:
      "Assign a hiring team, then preview the listing exactly as candidates will see it.",
  },
] as const satisfies readonly { key: string; label: string; blurb: string }[];

type SectionKey = (typeof SECTIONS)[number]["key"];

const FIELD_TO_SECTION: Record<string, SectionKey> = {
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

const RAIL_SECTIONS: EditorRailSection[] = SECTIONS.map((s) => ({
  key: s.key,
  label: s.label,
}));

type ExtraPreviewFields = {
  department: string;
  location: string;
  employmentType: string;
  experienceLevel: string;
  salaryMin?: number;
  salaryMax?: number;
  currency: string;
  salaryPeriod: string;
  officeAddress: string;
};

export function JobForm({
  action,
  job,
  submitLabel,
  departments,
  hiringTeam,
  workspaceMembers,
  aiConfigured,
  candidatePoolCount,
  eyebrow,
  statusBadge,
  headerActions,
  railActions,
  previewWorkspace,
  previewConfig,
}: JobFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const applicationConfig = normalizeJobApplicationConfig(
    job?.applicationConfig,
  );

  const [title, setTitle] = useState(job?.title ?? "");
  const [titleError, setTitleError] = useState(false);
  const [workplace, setWorkplace] = useState<string>(
    job?.workplaceType ?? "remote",
  );

  const [description, setDescription] = useState(
    job?.description ??
      "<p>Describe the role, the team, and the impact this person will have.</p>",
  );
  const [sections, setSections] = useState<JobContentSection[]>(() =>
    initialSectionsFor(job),
  );
  const [keywords, setKeywords] = useState<string[]>(() =>
    parseKeywords(job?.keywords),
  );
  const [photos, setPhotos] = useState<string[]>(() =>
    parseOfficePhotos(job?.officePhotos),
  );
  const [descriptionVersion, setDescriptionVersion] = useState(0);
  const [aiPending, startAi] = useTransition();

  const [dirty, setDirty] = useState(false);
  const { confirmDiscard, discardDialogProps } = useUnsavedChangesGuard(dirty);

  const [flashSection, setFlashSection] = useState<SectionKey | null>(null);
  const [reviewInView, setReviewInView] = useState(job?.status === "open");
  const reviewSectionRef = useRef<HTMLDivElement>(null);

  // Lazy-mount the hiring-team/AI-matching panel only once the Review
  // section actually scrolls into view , avoids running the AI cost surface
  // just because it's technically in the DOM below the fold.
  useEffect(() => {
    if (reviewInView) return;
    const el = reviewSectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setReviewInView(true);
      },
      { root: scrollRef.current, rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reviewInView]);

  // Fields the live preview needs but that aren't already lifted controlled
  // state (title/description/sections/keywords/photos/workplace all are).
  // Read straight off the form via a single bubbling listener instead of
  // lifting every remaining field to controlled state , keeps every section
  // file's existing uncontrolled/FormData submission mechanics untouched.
  const [extraFields, setExtraFields] = useState<ExtraPreviewFields>({
    department: job?.department ?? "",
    location: job?.location ?? "",
    employmentType: job?.employmentType ?? "full_time",
    experienceLevel: job?.experienceLevel ?? "",
    salaryMin: job?.salaryMin ?? undefined,
    salaryMax: job?.salaryMax ?? undefined,
    currency: job?.currency ?? "USD",
    salaryPeriod: job?.salaryPeriod ?? "annual",
    officeAddress: job?.officeAddress ?? "",
  });

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const fd = new FormData(form);
        const minRaw = fd.get("salaryMin");
        const maxRaw = fd.get("salaryMax");
        setExtraFields({
          department: String(fd.get("department") ?? ""),
          location: String(fd.get("location") ?? ""),
          employmentType: String(fd.get("employmentType") ?? "full_time"),
          experienceLevel: String(fd.get("experienceLevel") ?? ""),
          salaryMin: minRaw ? Number(minRaw) : undefined,
          salaryMax: maxRaw ? Number(maxRaw) : undefined,
          currency: String(fd.get("currency") ?? "USD"),
          salaryPeriod: String(fd.get("salaryPeriod") ?? "annual"),
          officeAddress: String(fd.get("officeAddress") ?? ""),
        });
      });
      setDirty(true);
    };
    form.addEventListener("input", sync);
    form.addEventListener("change", sync);
    sync();
    return () => {
      cancelAnimationFrame(raf);
      form.removeEventListener("input", sync);
      form.removeEventListener("change", sync);
    };
  }, []);

  const previewJob: PreviewJobDraft = {
    slug: job?.slug || "draft-preview",
    title,
    description,
    department: extraFields.department,
    location: extraFields.location,
    employmentType: extraFields.employmentType,
    workplaceType: workplace,
    experienceLevel: extraFields.experienceLevel || undefined,
    salaryMin: extraFields.salaryMin,
    salaryMax: extraFields.salaryMax,
    currency: extraFields.currency,
    salaryPeriod: extraFields.salaryPeriod,
    officeAddress: extraFields.officeAddress || undefined,
    contentSections: sections,
    officePhotos: photos,
    keywords,
  };

  async function handleExit() {
    if (!(await confirmDiscard())) return;
    window.location.href = "/dashboard/jobs";
  }

  function jumpToSection(key: SectionKey) {
    const el = document.getElementById(key);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setFlashSection(key);
    window.setTimeout(
      () => setFlashSection((current) => (current === key ? null : current)),
      700,
    );
    if (key === "review") setReviewInView(true);
  }

  // Validation
  const validateBeforeSubmit = useCallback((event: React.MouseEvent) => {
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
      applicationExperienceVisibility: fd.get(
        "applicationExperienceVisibility",
      ),
      applicationCoverLetterVisibility: fd.get(
        "applicationCoverLetterVisibility",
      ),
      applicationQuestionsJson: fd.get("applicationQuestionsJson"),
    });

    if (result.success) return;

    event.preventDefault();
    const issue = result.error.issues[0];
    if (!issue) return;

    toast.error(issue.message);

    const fieldName = String(issue.path[0] ?? "");
    const sectionKey = FIELD_TO_SECTION[fieldName] ?? "essentials";
    jumpToSection(sectionKey);

    if (fieldName === "title") {
      setTitleError(true);
    }
  }, []);

  const primaryActions = (
    <>
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
      <Button
        type="submit"
        name="intent"
        value="continue"
        size="sm"
        onClick={validateBeforeSubmit}
      >
        {submitLabel}
      </Button>
    </>
  );

  return (
    <form ref={formRef} action={action} className="contents">
      {job ? <input type="hidden" name="jobId" value={job.id} /> : null}
      <input
        type="hidden"
        name="contentSectionsJson"
        value={JSON.stringify(sections)}
      />
      <input
        type="hidden"
        name="keywordsJson"
        value={JSON.stringify(keywords)}
      />
      <input
        type="hidden"
        name="officePhotosJson"
        value={JSON.stringify(photos)}
      />

        <FocusModeShell
          topBar={
          <JobEditorTopBar
            onExit={handleExit}
            title={title}
            eyebrow={eyebrow}
            statusBadge={statusBadge}
            headerActions={headerActions}
            railActions={railActions}
            actions={primaryActions}
          />
        }
      >
        <JobEditorRail
          sections={RAIL_SECTIONS}
          scrollRootRef={scrollRef}
          secondaryActions={railActions}
        />

        <div
          ref={scrollRef}
          className="flex w-full min-w-0 max-w-2xl shrink-0 flex-col overflow-y-auto"
        >
          {/*
            No `min-h-full` here on purpose , percentage min-height on a flex
            item inside this `overflow-y-auto` column freezes the item's own
            box at the column's viewport height instead of growing with real
            content (a Chromium flex sizing quirk), while content keeps
            painting past it unclipped. That left the `mt-auto` footer row
            below pinned near the top with thousands of px of dead space
            under it on any job with real content. Footer just follows the
            content in normal flow instead; short drafts get a small gap
            before it rather than a forced full-viewport stretch.
          */}
          <div className="flex flex-col px-6 py-8">
            <div className="space-y-10">
              {SECTIONS.map((s) => (
                <section
                  key={s.key}
                  id={s.key}
                  className={cn(
                    "scroll-mt-6 rounded-2xl transition-colors duration-300",
                    flashSection === s.key && "bg-destructive/5",
                  )}
                >
                  <header className="mb-4 px-1">
                    <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
                      {s.label}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {s.blurb}
                    </p>
                  </header>

                  {s.key === "essentials" ? (
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
                  ) : null}

                  {s.key === "description" ? (
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
                  ) : null}

                  {s.key === "compensation" ? (
                    <div className="rounded-2xl border border-border/70 bg-card p-5">
                      <CompensationSection job={job} />
                    </div>
                  ) : null}

                  {s.key === "application" ? (
                    <div className="rounded-2xl border border-border/70 bg-card p-5">
                      <ApplicationSection
                        applicationConfig={applicationConfig}
                        aiContext={{ title, description, keywords }}
                      />
                    </div>
                  ) : null}

                  {s.key === "advanced" ? (
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
                  ) : null}

                  {s.key === "review" ? (
                    <div ref={reviewSectionRef}>
                      <ReviewSection
                        job={job}
                        title={title}
                        workplace={workplace}
                        submitLabel={submitLabel}
                        reviewVisited={reviewInView}
                        hiringTeam={hiringTeam}
                        workspaceMembers={workspaceMembers}
                        aiConfigured={aiConfigured}
                        candidatePoolCount={candidatePoolCount}
                      />
                    </div>
                  ) : null}
                </section>
              ))}
            </div>

            <div className="mt-auto flex items-center justify-end gap-2 border-t border-border/60 pt-6">
              {primaryActions}
            </div>
          </div>
        </div>

        <JobLivePreview
          job={previewJob}
          workspace={previewWorkspace ?? null}
          config={previewConfig ?? null}
        />
      </FocusModeShell>
      <UnsavedChangesDialog
        open={discardDialogProps.open}
        onConfirm={discardDialogProps.onConfirm}
        onCancel={discardDialogProps.onCancel}
      />
    </form>
  );
}
