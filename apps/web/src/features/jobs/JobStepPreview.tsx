"use client";

import { memo, useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Pencil } from "lucide-react";

import { RichBody } from "@/features/career-page/RichBody";
import { formatCompensation } from "@/features/career-page/job/jobMeta";
import { formatEmploymentType, formatWorkplaceType } from "@/lib/format";
import { cn, slugify } from "@/lib/utils";

import type { ApplicationFieldVisibility, JobContentSection } from "./config";
import {
  applicationFieldName,
  type ApplicationFieldKey,
  type FormPreviewFields,
} from "./preview-draft";
import { scrollInside } from "./scroll";
import { getPublishBlockers } from "./validation";

export type StepKey =
  | "essentials"
  | "description"
  | "compensation"
  | "application"
  | "advanced"
  | "review";

export type StepDraft = {
  title: string;
  description: string;
  sections: JobContentSection[];
  keywords: string[];
  photos: string[];
  workplace: string;
  fields: FormPreviewFields;
};

const STEP_TITLE: Record<StepKey, string> = {
  essentials: "Job header",
  description: "Job description",
  compensation: "Compensation",
  application: "Application form",
  advanced: "Search & visibility",
  review: "Ready to publish?",
};

const EASE = [0.16, 1, 0.3, 1] as const;

/** A previewed block. `fields` are the editor control names/targets that edit it. */
function Block({
  fields,
  focus,
  label,
  className,
  children,
}: {
  fields: string[];
  focus: string | null;
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const active = focus != null && fields.includes(focus);
  return (
    <div
      data-active-block={active ? "" : undefined}
      className={cn(
        "relative rounded-[var(--radius-inner)] px-3 py-2.5 transition-[background-color,box-shadow] duration-200 ease-out motion-reduce:transition-none",
        active
          ? "bg-lime-wash shadow-[0_0_0_1.5px_var(--chartreuse-signal)]"
          : "bg-transparent shadow-[0_0_0_1.5px_transparent]",
        className,
      )}
    >
      <span
        aria-hidden={!active}
        className={cn(
          "pointer-events-none absolute -top-2 right-2 inline-flex items-center gap-1 rounded-full bg-near-ink px-2 py-0.5 text-[10.5px] font-medium text-pure-snow transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
          active ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
        )}
      >
        <Pencil className="size-2.5" />
        {label ?? "Editing"}
      </span>
      {children}
    </div>
  );
}

function Value({ children, empty }: { children?: ReactNode; empty: string }) {
  return children ? (
    <span className="text-[14px] font-medium text-near-ink">{children}</span>
  ) : (
    <span className="text-[14px] text-quiet-mist">{empty}</span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-soft-ink">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

/** Mount/unmount with a height + fade reveal (the reflow is the point here). */
function Reveal({ show, children }: { show: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="reveal"
          initial={reduce ? false : { height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.22, ease: EASE }}
          className="overflow-clip"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function DetailsStep({ d, focus }: { d: StepDraft; focus: string | null }) {
  const f = d.fields;
  const place = [f.location, f.jobLocationRegion, f.jobLocationCountry.toUpperCase()]
    .filter(Boolean)
    .join(", ");
  return (
    <div className="space-y-4">
      <Block fields={["title"]} focus={focus} label="Job title">
        <h3 className="font-display text-[22px] leading-tight tracking-tight text-near-ink">
          {d.title.trim() || <span className="text-quiet-mist">Your job title</span>}
        </h3>
      </Block>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Block fields={["department"]} focus={focus}>
          <Row label="Department">
            <Value empty="Not set">{f.department}</Value>
          </Row>
        </Block>
        <Block
          fields={["location", "jobLocationRegion", "jobLocationCountry"]}
          focus={focus}
        >
          <Row label="Location">
            <Value empty="Not set">{place}</Value>
          </Row>
        </Block>
        <Block fields={["employmentType"]} focus={focus}>
          <Row label="Employment">
            <Value empty="Not set">{formatEmploymentType(f.employmentType)}</Value>
          </Row>
        </Block>
        <Block fields={["workplaceType"]} focus={focus}>
          <Row label="Workplace">
            <Value empty="Not set">{formatWorkplaceType(d.workplace)}</Value>
          </Row>
        </Block>
        <Block fields={["experienceLevel"]} focus={focus} className="col-span-2">
          <Row label="Experience">
            <Value empty="Not set">{f.experienceLevel}</Value>
          </Row>
        </Block>
      </div>
      <Reveal show={d.workplace === "remote"}>
        <Block fields={["remoteEligibleCountries"]} focus={focus}>
          <Row label="Remote eligibility">
            <Value empty="Worldwide">{f.remoteEligibleCountries.toUpperCase()}</Value>
          </Row>
        </Block>
      </Reveal>
      <Block fields={["validThrough"]} focus={focus}>
        <Row label="Posting expires">
          <Value empty="Never">{f.validThrough}</Value>
        </Row>
      </Block>
    </div>
  );
}

function DescriptionStep({ d, focus }: { d: StepDraft; focus: string | null }) {
  const hasHtml = (html: string) => html.replace(/<[^>]*>/g, "").trim().length > 0;
  return (
    <div className="space-y-3">
      <Block fields={["description"]} focus={focus} label="Writing">
        <p className="text-[15px] font-semibold text-near-ink">About this role</p>
        {hasHtml(d.description) ? (
          <RichBody html={d.description} className="prose-job mt-2 max-w-none text-[14px]" />
        ) : (
          <p className="mt-2 text-[14px] text-quiet-mist">
            What you write in the editor shows up here as you type.
          </p>
        )}
      </Block>
      <AnimatePresence initial={false}>
        {d.sections.map((s) => (
          <motion.div
            key={s.id}
            layout="position"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
          >
            <Block fields={[`section:${s.id}`]} focus={focus} label="Writing">
              <p className="text-[15px] font-semibold text-near-ink">
                {s.title.trim() || <span className="text-quiet-mist">Untitled section</span>}
              </p>
              {hasHtml(s.body) ? (
                <RichBody html={s.body} className="prose-job mt-2 max-w-none text-[14px]" />
              ) : (
                <p className="mt-2 text-[14px] text-quiet-mist">Empty section</p>
              )}
            </Block>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function CompensationStep({ d, focus }: { d: StepDraft; focus: string | null }) {
  const f = d.fields;
  const text = formatCompensation({
    salaryMin: f.salaryMin,
    salaryMax: f.salaryMax,
    currency: f.currency,
    salaryPeriod: f.salaryPeriod,
  } as Parameters<typeof formatCompensation>[0]);
  const top = Math.max(f.salaryMax ?? 0, f.salaryMin ?? 0, 1);
  const lo = f.salaryMin != null ? (f.salaryMin / top) * 100 : 0;
  const hi = f.salaryMax != null ? (f.salaryMax / top) * 100 : f.salaryMin != null ? 100 : 0;
  const benefits = d.sections.find((s) => /benefit|perk|compensation/i.test(s.title));
  return (
    <div className="space-y-4">
      <Block
        fields={["salaryMin", "salaryMax", "currency", "salaryPeriod"]}
        focus={focus}
        label="Salary"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-soft-ink">Salary</p>
        <p className="mt-1 font-display text-[24px] leading-tight tracking-tight tabular-nums text-near-ink">
          {text ?? <span className="text-quiet-mist">Not shown</span>}
        </p>
        <div className="mt-3 h-2 overflow-clip rounded-full bg-soft-kraft">
          <div
            className="h-full rounded-full bg-chartreuse-signal transition-[margin,width] duration-300 ease-out motion-reduce:transition-none"
            style={{
              marginLeft: `${Math.min(lo, 100)}%`,
              width: `${Math.max(0, Math.min(hi, 100) - Math.min(lo, 100) || (text ? 4 : 0))}%`,
            }}
          />
        </div>
        {!text ? (
          <p className="mt-2 text-[12.5px] text-soft-ink">
            Listing a range measurably increases applications.
          </p>
        ) : null}
      </Block>
      {benefits && benefits.body.replace(/<[^>]*>/g, "").trim() ? (
        <div className="rounded-[var(--radius-inner)] bg-card-inset px-3 py-2.5">
          <p className="text-[13px] font-semibold text-near-ink">{benefits.title}</p>
          <RichBody html={benefits.body} className="prose-job mt-1 max-w-none text-[13px]" />
        </div>
      ) : null}
    </div>
  );
}

const FIELD_ROWS: Array<{
  group: string;
  key: ApplicationFieldKey;
  label: string;
  kind: "line" | "upload" | "area";
}> = [
  { group: "Personal information", key: "phone", label: "Phone", kind: "line" },
  { group: "Personal information", key: "address", label: "Address", kind: "line" },
  { group: "Personal information", key: "photo", label: "Photo", kind: "upload" },
  { group: "Personal information", key: "headline", label: "Headline", kind: "line" },
  { group: "Profile", key: "resume", label: "Resume / CV", kind: "upload" },
  { group: "Profile", key: "linkedin", label: "LinkedIn", kind: "line" },
  { group: "Profile", key: "github", label: "GitHub", kind: "line" },
  { group: "Profile", key: "website", label: "Website / Portfolio", kind: "line" },
  { group: "Profile", key: "education", label: "Education", kind: "area" },
  { group: "Profile", key: "experience", label: "Experience", kind: "area" },
  { group: "Details", key: "coverLetter", label: "Cover letter", kind: "area" },
];

function FormField({
  label,
  visibility,
  kind,
  active,
  fixed,
}: {
  label: string;
  visibility: ApplicationFieldVisibility;
  kind: "line" | "upload" | "area";
  active: boolean;
  fixed?: boolean;
}) {
  const disabled = visibility === "disabled";
  return (
    <div
      data-active-block={active ? "" : undefined}
      className={cn(
        "relative rounded-[var(--radius-inner)] px-3 py-2 transition-[opacity,filter,transform,background-color,box-shadow] duration-300 ease-out motion-reduce:transition-none",
        disabled && "scale-[0.985] opacity-40 grayscale",
        active
          ? "bg-lime-wash shadow-[0_0_0_1.5px_var(--chartreuse-signal)]"
          : "shadow-[0_0_0_1.5px_transparent]",
      )}
    >
      <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-near-ink">
        <span className={cn(disabled && "line-through decoration-quiet-mist")}>{label}</span>
        <span
          aria-hidden={visibility !== "required"}
          className={cn(
            "text-danger-rust transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
            visibility === "required" ? "scale-100 opacity-100" : "scale-50 opacity-0",
          )}
        >
          *
        </span>
        <span
          aria-hidden={visibility !== "optional"}
          className={cn(
            "text-[11px] font-normal text-quiet-mist transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
            visibility === "optional" ? "translate-x-0 opacity-100" : "-translate-x-1 opacity-0",
          )}
        >
          Optional
        </span>
        {disabled ? (
          <span className="ml-auto text-[11px] font-normal text-soft-ink">Hidden from candidates</span>
        ) : fixed ? (
          <span className="ml-auto text-[11px] font-normal text-quiet-mist">Always asked</span>
        ) : null}
      </div>
      <div
        className={cn(
          "mt-1.5 rounded-md border border-dashed border-mist-border bg-card",
          kind === "line" && "h-8",
          kind === "upload" && "h-12",
          kind === "area" && "h-16",
        )}
      />
    </div>
  );
}

function ApplicationStep({ d, focus }: { d: StepDraft; focus: string | null }) {
  const groups = ["Personal information", "Profile", "Details"];
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-soft-ink">
          Your details
        </p>
        <div className="space-y-1.5">
          <FormField label="Full name" visibility="required" kind="line" active={false} fixed />
          <FormField label="Email" visibility="required" kind="line" active={false} fixed />
        </div>
      </div>
      {groups.map((group) => (
        <div key={group}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-soft-ink">
            {group}
          </p>
          <div className="space-y-1.5">
            {FIELD_ROWS.filter((r) => r.group === group).map((r) => (
              <FormField
                key={r.key}
                label={r.label}
                kind={r.kind}
                visibility={d.fields.visibility[r.key]}
                active={focus === applicationFieldName(r.key)}
              />
            ))}
            {group === "Details"
              ? d.fields.questions.map((q) => (
                  <FormField
                    key={q.id}
                    label={q.label}
                    kind={q.type === "textarea" ? "area" : "line"}
                    visibility={q.required ? "required" : "optional"}
                    active={false}
                  />
                ))
              : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function AdvancedStep({
  d,
  focus,
  aiConfigured,
}: {
  d: StepDraft;
  focus: string | null;
  aiConfigured: boolean;
}) {
  const f = d.fields;
  const slug = f.slug.trim() ? slugify(f.slug) : slugify(d.title) || "your-job-title";
  const onsite = d.workplace === "onsite" || d.workplace === "hybrid";
  return (
    <div className="space-y-3">
      <Block fields={["slug"]} focus={focus} label="Link">
        <Row label="Public link">
          <span className="break-all text-[13px] font-medium text-near-ink">/jobs/{slug}</span>
        </Row>
      </Block>
      <Block fields={["keywords"]} focus={focus} label="Keywords">
        <Row label="Keywords">
          <div className="flex flex-wrap gap-1.5">
            <AnimatePresence initial={false}>
              {d.keywords.map((k) => (
                <motion.span
                  key={k}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.18, ease: EASE }}
                  className="rounded-full bg-soft-kraft px-2.5 py-0.5 text-[12px] font-medium text-soft-ink"
                >
                  {k}
                </motion.span>
              ))}
            </AnimatePresence>
            {d.keywords.length === 0 ? <Value empty="No keywords yet" /> : null}
          </div>
        </Row>
      </Block>
      <div className="grid grid-cols-2 gap-3">
        <Block fields={["experienceLevel"]} focus={focus}>
          <Row label="Experience">
            <Value empty="Not set">{f.experienceLevel}</Value>
          </Row>
        </Block>
        <Block fields={["education"]} focus={focus}>
          <Row label="Education">
            <Value empty="Not set">{f.education}</Value>
          </Row>
        </Block>
      </div>
      <Reveal show={onsite}>
        <Block fields={["officeAddress", "office"]} focus={focus} label="Office">
          <Row label="Office">
            <Value empty="Add an address to show a map">{f.officeAddress}</Value>
          </Row>
          {d.photos.length > 0 ? (
            <p className="mt-1 text-[12px] text-soft-ink">
              {d.photos.length} office photo{d.photos.length === 1 ? "" : "s"}
            </p>
          ) : null}
        </Block>
      </Reveal>
      <Reveal show={d.workplace === "remote"}>
        <div className="rounded-[var(--radius-inner)] bg-card-inset px-3 py-2.5 text-[13px] text-soft-ink">
          Remote role: no office map is shown on the posting.
        </div>
      </Reveal>
      {aiConfigured ? (
        <Block fields={["evaluationMode"]} focus={focus} label="AI scoring">
          <Row label="AI evaluation style">
            <Value empty="Balanced">
              {f.evaluationMode
                ? f.evaluationMode[0].toUpperCase() + f.evaluationMode.slice(1)
                : ""}
            </Value>
          </Row>
        </Block>
      ) : null}
    </div>
  );
}

function ReviewStep({ d, status }: { d: StepDraft; status: "draft" | "open" | "closed" }) {
  const hasContent = getPublishBlockers({
    description: d.description,
    contentSections: d.sections,
  }).length === 0;
  const required = Object.values(d.fields.visibility).filter((v) => v === "required").length;
  const items: Array<{ ok: boolean; text: string; optional?: boolean }> = [
    { ok: d.title.trim().length > 0, text: "Job title" },
    { ok: hasContent, text: "Description or at least one section" },
    {
      ok: d.fields.salaryMin != null || d.fields.salaryMax != null,
      text: "Salary range",
      optional: true,
    },
    { ok: d.keywords.length > 0, text: "Keywords", optional: true },
  ];
  return (
    <div className="space-y-3">
      <div className="rounded-[var(--radius-inner)] bg-card-inset px-3 py-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full",
              status === "open" ? "bg-success-olive" : "bg-quiet-mist",
            )}
          />
          <p className="text-[13px] font-semibold text-near-ink">
            {status === "open" ? "Live" : status === "closed" ? "Closed" : "Draft"}
          </p>
        </div>
        <p className="mt-1 font-display text-[18px] leading-tight text-near-ink">
          {d.title.trim() || "Your job title"}
        </p>
      </div>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i.text} className="flex items-center gap-2 text-[13px]">
            <span
              className={cn(
                "flex size-4.5 items-center justify-center rounded-full transition-colors duration-200",
                i.ok ? "bg-success-olive text-pure-snow" : "bg-soft-kraft text-transparent",
              )}
            >
              <Check className="size-3" strokeWidth={3} />
            </span>
            <span className={i.ok ? "text-near-ink" : "text-soft-ink"}>
              {i.text}
              {i.optional && !i.ok ? " (optional)" : ""}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[12.5px] text-soft-ink">
        Candidates will be asked for {required + 2} required field{required + 2 === 1 ? "" : "s"}.
      </p>
    </div>
  );
}

/**
 * Interactive, step-aware preview. The "camera" follows the editor: the card
 * for the active step slides in, the block being edited is highlighted with an
 * "Editing" tag and scrolled into view, and edits render live. Changes inside
 * a step are CSS transitions (opacity/transform only) that switch off under
 * `prefers-reduced-motion`.
 */
export const JobStepPreview = memo(function JobStepPreview({
  step,
  draft,
  focus,
  status,
  aiConfigured,
}: {
  step: StepKey;
  draft: StepDraft;
  focus: string | null;
  status: "draft" | "open" | "closed";
  aiConfigured: boolean;
}) {
  const reduce = useReducedMotion();
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const raf = requestAnimationFrame(() => {
      const el = root.querySelector<HTMLElement>("[data-active-block]");
      if (el) scrollInside(root, el);
      else if (!focus) root.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [step, focus, reduce]);

  return (
    <div ref={scroller} className="h-full overflow-y-auto overscroll-contain p-4 sm:p-6">
      <div className="mx-auto max-w-md">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={reduce ? false : { opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: EASE }}
            className="rounded-[var(--radius-card)] bg-card p-5 shadow-[var(--shadow-card)]"
          >
            <p className="mb-4 text-[12.5px] font-semibold text-soft-ink">{STEP_TITLE[step]}</p>
            {step === "essentials" ? <DetailsStep d={draft} focus={focus} /> : null}
            {step === "description" ? <DescriptionStep d={draft} focus={focus} /> : null}
            {step === "compensation" ? <CompensationStep d={draft} focus={focus} /> : null}
            {step === "application" ? <ApplicationStep d={draft} focus={focus} /> : null}
            {step === "advanced" ? (
              <AdvancedStep d={draft} focus={focus} aiConfigured={aiConfigured} />
            ) : null}
            {step === "review" ? <ReviewStep d={draft} status={status} /> : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
});
