"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { toast } from "@/lib/notification-island/toast";
import { useRouter } from "next/navigation";
import type { Job } from "@harly/db";

import {
  normalizeJobApplicationConfig,
  parseJobContentSections,
  parseKeywords,
  parseOfficePhotos,
  type JobContentSection,
} from "./config";
import { getPublishBlockers, jobFormSchema } from "./validation";
import {
  readFormPreviewFields,
  sameFormPreviewFields,
  visibilityFromConfig,
  type FormPreviewFields,
} from "./preview-draft";
import type { StepDraft } from "./JobStepPreview";
import { scrollWithinEditor, EDITOR_SCROLL_ROOT_ATTR } from "./scroll";
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
import {
  JobLivePreview,
  usePreviewDocked,
  type PreviewFocus,
  type PreviewJobDraft,
} from "./JobLivePreview";
import { FocusModeShell } from "@/components/focus-mode/FocusModeShell";
import { useUnsavedChangesGuard } from "@/components/focus-mode/useUnsavedChangesGuard";
import { UnsavedChangesDialog } from "@/components/focus-mode/UnsavedChangesDialog";
import { ArrowLeft, ArrowRight, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  evaluationMode: "advanced",
  keywordsJson: "advanced",
  officeAddress: "advanced",
  officePhotosJson: "advanced",
};

/** Preview anchor each editor section points at when it becomes active. */
const SECTION_PREVIEW_TARGET: Partial<Record<SectionKey, string>> = {
  essentials: "title",
  description: "description",
  compensation: "meta",
  advanced: "keywords",
};

/** Preview anchor for a focused control, by its name/id (else by section). */
const FIELD_PREVIEW_TARGET: Record<string, string> = {
  title: "title",
  department: "meta",
  location: "meta",
  employmentType: "meta",
  workplaceType: "meta",
  jobLocationCountry: "meta",
  jobLocationRegion: "meta",
  remoteEligibleCountries: "meta",
  experienceLevel: "meta",
  salaryMin: "meta",
  salaryMax: "meta",
  currency: "meta",
  salaryPeriod: "meta",
  officeAddress: "office",
};

const RAIL_SECTIONS: EditorRailSection[] = SECTIONS.map((s) => ({
  key: s.key,
  label: s.label,
}));


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
  const router = useRouter();
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

  // Empty for new jobs: the editor shows its own placeholder, and nothing fake
  // is ever submitted as the description.
  const [description, setDescription] = useState(job?.description ?? "");
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
  const [activeSection, setActiveSection] = useState<SectionKey>(SECTIONS[0].key);
  const activeSectionRef = useRef<string>(SECTIONS[0].key);
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
  const [extraFields, setExtraFields] = useState<FormPreviewFields>({
    department: job?.department ?? "",
    location: job?.location ?? "",
    employmentType: job?.employmentType ?? "full_time",
    experienceLevel: job?.experienceLevel ?? "",
    education: job?.education ?? "",
    salaryMin: job?.salaryMin ?? undefined,
    salaryMax: job?.salaryMax ?? undefined,
    currency: job?.currency ?? "USD",
    salaryPeriod: job?.salaryPeriod ?? "annual",
    officeAddress: job?.officeAddress ?? "",
    jobLocationCountry: job?.jobLocationCountry ?? "",
    jobLocationRegion: job?.jobLocationRegion ?? "",
    remoteEligibleCountries: (
      (job?.remoteEligibleCountries as string[] | undefined) ?? []
    ).join(", "),
    validThrough: job?.validThrough
      ? job.validThrough.toISOString().slice(0, 10)
      : "",
    slug: job?.slug ?? "",
    evaluationMode: job?.evaluationMode ?? "balanced",
    visibility: visibilityFromConfig(applicationConfig),
    questions: applicationConfig.questions as FormPreviewFields["questions"],
  });

  const extraRef = useRef(extraFields);
  useEffect(() => {
    extraRef.current = extraFields;
  }, [extraFields]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    let raf = 0;
    let isInitialSync = true;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = readFormPreviewFields(new FormData(form), extraRef.current);
        // Same values -> same state object -> no re-render of the whole form.
        setExtraFields((prev) => (sameFormPreviewFields(prev, next) ? prev : next));
      });
      // Skip the sync triggered by mounting/hydration , only real user edits
      // should flip the "unsaved changes" guard on.
      if (!isInitialSync) setDirty(true);
      isInitialSync = false;
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

  const previewJob = useMemo<PreviewJobDraft>(
    () => ({
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
    }),
    [
      job?.slug,
      title,
      description,
      extraFields,
      workplace,
      sections,
      photos,
      keywords,
    ],
  );

  const stepDraft = useMemo<StepDraft>(
    () => ({
      title,
      description,
      sections,
      keywords,
      photos,
      workplace,
      fields: extraFields,
    }),
    [title, description, sections, keywords, photos, workplace, extraFields],
  );

  // ── Preview: docked column from xl, sheet below ──
  const previewDocked = usePreviewDocked();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFocus, setPreviewFocus] = useState<PreviewFocus>({
    target: null,
    field: null,
    tick: 0,
  });
  const pointPreviewAt = useCallback(
    (target: string | null, field: string | null = null) => {
      setPreviewFocus((prev) => ({ target, field, tick: prev.tick + 1 }));
    },
    [],
  );

  // The section scrolled into view drives the preview (see handleActiveChange)

  // ...and a focused control refines it to the exact block being edited.
  const handleFocusCapture = useCallback(
    (event: React.FocusEvent<HTMLElement>) => {
      const el = event.target as HTMLElement;
      const explicit = el
        .closest<HTMLElement>("[data-preview-target]")
        ?.getAttribute("data-preview-target");
      const named = FIELD_PREVIEW_TARGET[el.getAttribute("name") ?? el.id];
      const target = explicit ?? named;
      // A focused control also fixes the step (the scrollspy can lag behind
      // on short sections or keyboard navigation).
      const sectionId = el.closest("section[id]")?.id;
      if (sectionId && SECTIONS.some((x) => x.key === sectionId)) {
        activeSectionRef.current = sectionId;
        setActiveSection(sectionId as SectionKey);
      }
      const field = explicit ?? (el.getAttribute("name") || el.id || null);
      if (target || field) pointPreviewAt(target ?? null, field);
    },
    [pointPreviewAt],
  );

  // Publishing needs readable content; saving a draft only needs a title.
  const publishBlockers = useMemo(
    () => getPublishBlockers({ description, contentSections: sections }),
    [description, sections],
  );
  const publishHint =
    (!job || job.status === "open") && publishBlockers.length > 0
      ? publishBlockers[0]
      : null;
  const aiOn = Boolean(aiConfigured);

  async function handleExit() {
    if (!(await confirmDiscard())) return;
    router.push("/dashboard/jobs");
  }

  function jumpToSection(key: SectionKey) {
    const el = document.getElementById(key);
    if (!el) return;
    // Scroll only the editor column: native scrollIntoView also scrolls the
    // clipped shell ancestors and leaves the page blank.
    scrollWithinEditor(el, { align: "start", topInset: 16 });
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
      evaluationMode: fd.get("evaluationMode"),
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

    const intent = (event.currentTarget as HTMLButtonElement).value;
    const publishing =
      intent !== "draft" && (!job || job.status === "open");
    const blockers = publishing
      ? getPublishBlockers({
          description: String(fd.get("description") ?? ""),
          contentSections: fd.get("contentSectionsJson"),
        })
      : [];

    if (result.success && blockers.length === 0) return;

    event.preventDefault();
    const issue = result.success
      ? { message: blockers[0], path: ["description"] }
      : result.error.issues[0];
    if (!issue) return;

    toast.error(issue.message);

    const fieldName = String(issue.path[0] ?? "");
    const sectionKey = FIELD_TO_SECTION[fieldName] ?? "essentials";
    jumpToSection(sectionKey);

    if (fieldName === "title") {
      setTitleError(true);
    }
  }, [job]);

  const handleActiveChange = useCallback(
    (key: string) => {
      setActiveSection((prev) => {
        if (prev === key) return prev;
        return key as SectionKey;
      });
      if (key !== activeSectionRef.current) {
        activeSectionRef.current = key;
        pointPreviewAt(SECTION_PREVIEW_TARGET[key as SectionKey] ?? null);
      }
    },
    [pointPreviewAt],
  );

  const activeIndex = SECTIONS.findIndex((s) => s.key === activeSection);
  const previousSection = activeIndex > 0 ? SECTIONS[activeIndex - 1].key : null;
  const nextSection =
    activeIndex >= 0 && activeIndex < SECTIONS.length - 1
      ? SECTIONS[activeIndex + 1].key
      : null;

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
    <form
      ref={formRef}
      action={action}
      className="contents"
      onFocusCapture={handleFocusCapture}
    >
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
          active={activeSection}
          onActiveChange={handleActiveChange}
          onSelect={(key) => jumpToSection(key as SectionKey)}
          secondaryActions={railActions}
        />

        <div
          ref={scrollRef}
          {...{ [EDITOR_SCROLL_ROOT_ATTR]: "" }}
          className="relative mx-auto flex w-full min-w-0 max-w-2xl flex-1 flex-col overflow-y-auto overscroll-contain xl:mx-0 xl:w-[34rem] xl:flex-none 2xl:w-[40rem]"
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
          <div className="flex flex-col px-4 pb-8 pt-6 sm:px-6">
            <div className="space-y-10">
              {SECTIONS.map((s) => (
                <section
                  key={s.key}
                  id={s.key}
                  className={cn(
                    "scroll-mt-6 rounded-2xl transition-colors duration-300",
                    flashSection === s.key && "bg-destructive/10",
                  )}
                >
                  <header className="mb-4 px-1">
                    <h2 className="font-display text-[20px] tracking-tight text-near-ink">
                      {s.label}
                    </h2>
                    <p className="mt-1 text-[13.5px] text-soft-ink">
                      {s.blurb}
                    </p>
                  </header>

                  {s.key === "essentials" ? (
                    <Card className="p-5">
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
                    </Card>
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
                      aiConfigured={aiOn}
                      publishHint={publishHint}
                    />
                  ) : null}

                  {s.key === "compensation" ? (
                    <Card className="p-5">
                      <CompensationSection job={job} />
                    </Card>
                  ) : null}

                  {s.key === "application" ? (
                    <Card className="p-5">
                      <ApplicationSection
                        applicationConfig={applicationConfig}
                        aiContext={
                          aiOn ? { title, description, keywords } : undefined
                        }
                      />
                    </Card>
                  ) : null}

                  {s.key === "advanced" ? (
                    <Card className="p-5">
                      <AdvancedSection
                        job={job}
                        workplace={workplace}
                        keywords={keywords}
                        setKeywords={setKeywords}
                        photos={photos}
                        setPhotos={setPhotos}
                        aiConfigured={aiOn}
                      />
                    </Card>
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

          </div>

          {/* Sticky wizard bar: Back (ghost) and Continue (ink) walk the steps;
              the last step swaps Continue for the real submit actions. */}
          <div className="sticky bottom-0 z-10 mt-auto flex items-center flex-wrap justify-between gap-2 border-t border-hairline bg-pure-snow/90 px-4 py-3 backdrop-blur-sm sm:px-6">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => previousSection && jumpToSection(previousSection)}
                disabled={!previousSection}
              >
                <ArrowLeft className="size-4" />
                Back
              </Button>
              {!previewDocked ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPreviewOpen(true)}
                >
                  <Eye className="size-4" />
                  Preview
                </Button>
              ) : null}
            </div>
            {nextSection ? (
              <Button type="button" onClick={() => jumpToSection(nextSection)}>
                Continue
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2">{primaryActions}</div>
            )}
          </div>
        </div>

        <JobLivePreview
          job={previewJob}
          workspace={previewWorkspace ?? null}
          config={previewConfig ?? null}
          focus={previewFocus}
          docked={previewDocked}
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          step={activeSection}
          draft={stepDraft}
          status={job?.status ?? "draft"}
          aiConfigured={aiOn}
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
