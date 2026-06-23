"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Banknote, ClipboardList, Settings2, Lightbulb } from "lucide-react";
import type { Job } from "@harly/db";

import {
  normalizeJobApplicationConfig,
  parseJobContentSections,
  parseKeywords,
  parseOfficePhotos,
  type JobContentSection,
} from "./config";
import { jobFormSchema } from "./validation";
import { EssentialsSection } from "./sections/EssentialsSection";
import { DescriptionSection } from "./sections/DescriptionSection";
import { CompensationSection } from "./sections/CompensationSection";
import { ApplicationSection } from "./sections/ApplicationSection";
import { AdvancedSection } from "./sections/AdvancedSection";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type JobFormProps = {
  action: (formData: FormData) => Promise<void>;
  job?: Job;
  submitLabel: string;
  departments: string[];
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

const TIPS: Record<string, { heading: string; items: string[] }> = {
  essentials: {
    heading: "Writing a strong posting",
    items: [
      'Use a common job title — "Backend Engineer", not "Code Ninja". It lifts search visibility.',
      "One role per posting. Hiring two? Create two jobs.",
      "Listing a salary range measurably increases applications.",
    ],
  },
  description: {
    heading: "Describing the role",
    items: [
      "Lead with impact and team, not a wall of requirements.",
      "Use sections and templates so it stays scannable.",
      "Keep must-haves short — long lists scare off good candidates.",
    ],
  },
  compensation: {
    heading: "Pay transparency",
    items: [
      "Jobs with salary ranges get up to 30% more applicants.",
      "Many jurisdictions now require pay disclosure — adding it keeps you compliant.",
    ],
  },
  application: {
    heading: "Designing the form",
    items: [
      "Ask only what you’ll actually use to decide.",
      "Every extra required field lowers completion rate.",
      "Make profile links optional — not everyone has a GitHub.",
    ],
  },
  advanced: {
    heading: "Fine-tuning",
    items: [
      "Keywords improve search on your careers page and future job-board syndication.",
      "A custom slug lets you share cleaner URLs.",
    ],
  },
};

const FIELD_TO_SECTION: Record<string, string> = {
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
  profileLinkLinkedin: "application",
  profileLinkGithub: "application",
  profileLinkWebsite: "application",
  applicationQuestionsJson: "application",
  slug: "advanced",
  experienceLevel: "advanced",
  education: "advanced",
  keywordsJson: "advanced",
  officeAddress: "advanced",
  officePhotosJson: "advanced",
};

type DisclosureKey = "compensation" | "application" | "advanced";

export function JobForm({ action, job, submitLabel, departments }: JobFormProps) {
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

  // Collapsible section state — auto-expand on edit if data present
  const [openSections, setOpenSections] = useState<Record<DisclosureKey, boolean>>({
    compensation: Boolean(job?.salaryMin || job?.salaryMax),
    application: applicationConfig.questions.length > 0 || !applicationConfig.resumeRequired,
    advanced: Boolean(
      job?.slug || job?.experienceLevel || job?.education || parseKeywords(job?.keywords).length > 0,
    ),
  });

  function toggleSection(key: DisclosureKey) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function expandSection(key: DisclosureKey) {
    setOpenSections((prev) => ({ ...prev, [key]: true }));
  }

  // Scroll-aware tips
  const [activeSection, setActiveSection] = useState("essentials");

  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>("[data-section]");
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let best: { key: string; ratio: number } | null = null;
        for (const entry of entries) {
          const key = entry.target.getAttribute("data-section");
          if (key && entry.intersectionRatio > (best?.ratio ?? 0)) {
            best = { key, ratio: entry.intersectionRatio };
          }
        }
        if (best) setActiveSection(best.key);
      },
      { threshold: [0, 0.3, 0.6, 1], rootMargin: "-80px 0px -40% 0px" },
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);

  const tip = TIPS[activeSection] ?? TIPS.essentials;

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
        resumeRequired: fd.get("resumeRequired"),
        profileLinkLinkedin: fd.get("profileLinkLinkedin"),
        profileLinkGithub: fd.get("profileLinkGithub"),
        profileLinkWebsite: fd.get("profileLinkWebsite"),
        applicationQuestionsJson: fd.get("applicationQuestionsJson"),
      });

      if (result.success) return;

      event.preventDefault();
      const issue = result.error.issues[0];
      if (!issue) return;

      toast.error(issue.message);

      const fieldName = String(issue.path[0] ?? "");
      const sectionKey = FIELD_TO_SECTION[fieldName];
      if (sectionKey && sectionKey !== "essentials" && sectionKey !== "description") {
        expandSection(sectionKey as DisclosureKey);
      }

      // Scroll to section after a tick (allow expand animation)
      setTimeout(() => {
        const el = document.querySelector(`[data-section="${sectionKey ?? "essentials"}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);

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

      {/* Sticky header */}
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
            <Button
              type="submit"
              name="intent"
              value="continue"
              size="sm"
              onClick={validateBeforeSubmit}
            >
              {submitLabel}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        {/* Main column */}
        <div className="min-w-0 space-y-5">
          {/* Essentials card */}
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

          {/* Description card */}
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

          {/* Collapsible config */}
          <div className="space-y-3">
            <Disclosure
              sectionId="compensation"
              title="Compensation"
              icon={Banknote}
              open={openSections.compensation}
              onToggle={() => toggleSection("compensation")}
            >
              <CompensationSection job={job} />
            </Disclosure>

            <Disclosure
              sectionId="application"
              title="Application form"
              icon={ClipboardList}
              open={openSections.application}
              onToggle={() => toggleSection("application")}
            >
              <ApplicationSection applicationConfig={applicationConfig} />
            </Disclosure>

            <Disclosure
              sectionId="advanced"
              title="Advanced"
              icon={Settings2}
              open={openSections.advanced}
              onToggle={() => toggleSection("advanced")}
            >
              <AdvancedSection
                job={job}
                workplace={workplace}
                keywords={keywords}
                setKeywords={setKeywords}
                photos={photos}
                setPhotos={setPhotos}
              />
            </Disclosure>
          </div>
        </div>

        {/* Tips sidebar */}
        <aside className="hidden h-fit lg:sticky lg:top-12 lg:block">
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
/*  Disclosure                                                        */
/* ------------------------------------------------------------------ */

function Disclosure({
  sectionId,
  title,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  sectionId: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div data-section={sectionId} className="rounded-2xl border border-border/70 bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-muted">
            <Icon className="size-4 text-muted-foreground" />
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight">
            {title}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t px-5 pb-5 pt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
