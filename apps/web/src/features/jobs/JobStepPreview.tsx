"use client";

import { memo, useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Pencil } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { RichBody } from "@/features/career-page/RichBody";
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

const EASE = [0.16, 1, 0.3, 1] as const;

const EVALUATION_MODES = new Set(["relaxed", "balanced", "strict"]);

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
  const t = useTranslations("jobs.stepPreview");
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
        {label ?? t("editing")}
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
  const t = useTranslations("jobs.stepPreview");
  const f = d.fields;
  const place = [f.location, f.jobLocationRegion, f.jobLocationCountry.toUpperCase()]
    .filter(Boolean)
    .join(", ");
  return (
    <div className="space-y-4">
      <Block fields={["title"]} focus={focus} label={t("jobTitle")}>
        <h3 className="font-display text-[22px] leading-tight tracking-tight text-near-ink">
          {d.title.trim() || <span className="text-quiet-mist">{t("yourJobTitle")}</span>}
        </h3>
      </Block>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Block fields={["department"]} focus={focus}>
          <Row label={t("department")}>
            <Value empty={t("notSet")}>{f.department}</Value>
          </Row>
        </Block>
        <Block
          fields={["location", "jobLocationRegion", "jobLocationCountry"]}
          focus={focus}
        >
          <Row label={t("location")}>
            <Value empty={t("notSet")}>{place}</Value>
          </Row>
        </Block>
        <Block fields={["employmentType"]} focus={focus}>
          <Row label={t("employmentLabel")}>
            <Value empty={t("notSet")}>{t(`employment.${f.employmentType}`)}</Value>
          </Row>
        </Block>
        <Block fields={["workplaceType"]} focus={focus}>
          <Row label={t("workplaceLabel")}>
            <Value empty={t("notSet")}>{t(`workplace.${d.workplace}`)}</Value>
          </Row>
        </Block>
        <Block fields={["experienceLevel"]} focus={focus} className="col-span-2">
          <Row label={t("experience")}>
            <Value empty={t("notSet")}>{f.experienceLevel}</Value>
          </Row>
        </Block>
      </div>
      <Reveal show={d.workplace === "remote"}>
        <Block fields={["remoteEligibleCountries"]} focus={focus}>
          <Row label={t("remoteEligibility")}>
            <Value empty={t("worldwide")}>{f.remoteEligibleCountries.toUpperCase()}</Value>
          </Row>
        </Block>
      </Reveal>
      <Block fields={["validThrough"]} focus={focus}>
        <Row label={t("postingExpires")}>
          <Value empty={t("never")}>{f.validThrough}</Value>
        </Row>
      </Block>
    </div>
  );
}

function DescriptionStep({ d, focus }: { d: StepDraft; focus: string | null }) {
  const t = useTranslations("jobs.stepPreview");
  const hasHtml = (html: string) => html.replace(/<[^>]*>/g, "").trim().length > 0;
  return (
    <div className="space-y-3">
      <Block fields={["description"]} focus={focus} label={t("writing")}>
        <p className="text-[15px] font-semibold text-near-ink">{t("aboutRole")}</p>
        {hasHtml(d.description) ? (
          <RichBody html={d.description} className="prose-job mt-2 max-w-none text-[14px]" />
        ) : (
          <p className="mt-2 text-[14px] text-quiet-mist">
            {t("descriptionPlaceholder")}
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
            <Block fields={[`section:${s.id}`]} focus={focus} label={t("writing")}>
              <p className="text-[15px] font-semibold text-near-ink">
                {s.title.trim() || <span className="text-quiet-mist">{t("untitledSection")}</span>}
              </p>
              {hasHtml(s.body) ? (
                <RichBody html={s.body} className="prose-job mt-2 max-w-none text-[14px]" />
              ) : (
                <p className="mt-2 text-[14px] text-quiet-mist">{t("emptySection")}</p>
              )}
            </Block>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function CompensationStep({ d, focus }: { d: StepDraft; focus: string | null }) {
  const t = useTranslations("jobs.stepPreview");
  const format = useFormatter();
  const f = d.fields;
  const currency = f.currency || "USD";
  const formatAmount = (amount: number) => {
    try {
      return format.number(amount, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      });
    } catch {
      return `${currency} ${format.number(amount)}`;
    }
  };
  const range =
    f.salaryMin != null && f.salaryMax != null
      ? `${formatAmount(f.salaryMin)} – ${formatAmount(f.salaryMax)}`
      : f.salaryMin != null || f.salaryMax != null
        ? formatAmount((f.salaryMin ?? f.salaryMax)!)
        : null;
  const text = range
    ? f.salaryPeriod === "monthly"
      ? t("salaryMonthly", { range })
      : t("salaryYearly", { range })
    : null;
  const top = Math.max(f.salaryMax ?? 0, f.salaryMin ?? 0, 1);
  const lo = f.salaryMin != null ? (f.salaryMin / top) * 100 : 0;
  const hi = f.salaryMax != null ? (f.salaryMax / top) * 100 : f.salaryMin != null ? 100 : 0;
  const benefits = d.sections.find((s) => /benefit|perk|compensation/i.test(s.title));
  return (
    <div className="space-y-4">
      <Block
        fields={["salaryMin", "salaryMax", "currency", "salaryPeriod"]}
        focus={focus}
        label={t("salary")}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wide text-soft-ink">{t("salary")}</p>
        <p className="mt-1 font-display text-[24px] leading-tight tracking-tight tabular-nums text-near-ink">
          {text ?? <span className="text-quiet-mist">{t("notShown")}</span>}
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
            {t("salaryHint")}
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
  group: "personal" | "profile" | "details";
  key: ApplicationFieldKey;
  labelKey: string;
  kind: "line" | "upload" | "area";
}> = [
  { group: "personal", key: "phone", labelKey: "phone", kind: "line" },
  { group: "personal", key: "address", labelKey: "address", kind: "line" },
  { group: "personal", key: "photo", labelKey: "photo", kind: "upload" },
  { group: "personal", key: "headline", labelKey: "headline", kind: "line" },
  { group: "profile", key: "resume", labelKey: "resume", kind: "upload" },
  { group: "profile", key: "linkedin", labelKey: "linkedin", kind: "line" },
  { group: "profile", key: "github", labelKey: "github", kind: "line" },
  { group: "profile", key: "website", labelKey: "website", kind: "line" },
  { group: "profile", key: "education", labelKey: "education", kind: "area" },
  { group: "profile", key: "experience", labelKey: "experience", kind: "area" },
  { group: "details", key: "coverLetter", labelKey: "coverLetter", kind: "area" },
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
  const t = useTranslations("jobs.stepPreview");
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
          {t("optional")}
        </span>
        {disabled ? (
          <span className="ml-auto text-[11px] font-normal text-soft-ink">{t("hiddenFromCandidates")}</span>
        ) : fixed ? (
          <span className="ml-auto text-[11px] font-normal text-quiet-mist">{t("alwaysAsked")}</span>
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
  const t = useTranslations("jobs.stepPreview");
  const groups = ["personal", "profile", "details"] as const;
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-soft-ink">
          {t("yourDetails")}
        </p>
        <div className="space-y-1.5">
          <FormField label={t("fullName")} visibility="required" kind="line" active={false} fixed />
          <FormField label={t("email")} visibility="required" kind="line" active={false} fixed />
        </div>
      </div>
      {groups.map((group) => (
        <div key={group}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-soft-ink">
            {t(group)}
          </p>
          <div className="space-y-1.5">
            {FIELD_ROWS.filter((r) => r.group === group).map((r) => (
              <FormField
                key={r.key}
                label={t(`field.${r.labelKey}`)}
                kind={r.kind}
                visibility={d.fields.visibility[r.key]}
                active={focus === applicationFieldName(r.key)}
              />
            ))}
            {group === "details"
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
  const t = useTranslations("jobs.stepPreview");
  const f = d.fields;
  const slug = f.slug.trim() ? slugify(f.slug) : slugify(d.title) || "your-job-title";
  const onsite = d.workplace === "onsite" || d.workplace === "hybrid";
  return (
    <div className="space-y-3">
      <Block fields={["slug"]} focus={focus} label={t("link")}>
        <Row label={t("publicLink")}>
          <span className="break-all text-[13px] font-medium text-near-ink">/jobs/{slug}</span>
        </Row>
      </Block>
      <Block fields={["keywords"]} focus={focus} label={t("keywords")}>
        <Row label={t("keywords")}>
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
            {d.keywords.length === 0 ? <Value empty={t("noKeywordsYet")} /> : null}
          </div>
        </Row>
      </Block>
      <div className="grid grid-cols-2 gap-3">
        <Block fields={["experienceLevel"]} focus={focus}>
          <Row label={t("experience")}>
            <Value empty={t("notSet")}>{f.experienceLevel}</Value>
          </Row>
        </Block>
        <Block fields={["education"]} focus={focus}>
          <Row label={t("education")}>
            <Value empty={t("notSet")}>{f.education}</Value>
          </Row>
        </Block>
      </div>
      <Reveal show={onsite}>
        <Block fields={["officeAddress", "office"]} focus={focus} label={t("office")}>
          <Row label={t("office")}>
            <Value empty={t("officeAddressEmpty")}>{f.officeAddress}</Value>
          </Row>
          {d.photos.length > 0 ? (
            <p className="mt-1 text-[12px] text-soft-ink">
              {t("officePhotosCount", { count: d.photos.length })}
            </p>
          ) : null}
        </Block>
      </Reveal>
      <Reveal show={d.workplace === "remote"}>
        <div className="rounded-[var(--radius-inner)] bg-card-inset px-3 py-2.5 text-[13px] text-soft-ink">
          {t("remoteNoMap")}
        </div>
      </Reveal>
      {aiConfigured ? (
        <Block fields={["evaluationMode"]} focus={focus} label={t("aiScoring")}>
          <Row label={t("evaluationStyle")}>
            <Value empty={t("balanced")}>
              {f.evaluationMode && EVALUATION_MODES.has(f.evaluationMode)
                ? t(`evaluation.${f.evaluationMode}`)
                : f.evaluationMode}
            </Value>
          </Row>
        </Block>
      ) : null}
    </div>
  );
}

function ReviewStep({ d, status }: { d: StepDraft; status: "draft" | "open" | "closed" }) {
  const t = useTranslations("jobs.stepPreview");
  const hasContent = getPublishBlockers({
    description: d.description,
    contentSections: d.sections,
  }).length === 0;
  const required = Object.values(d.fields.visibility).filter((v) => v === "required").length;
  const items: Array<{ ok: boolean; key: string; optional?: boolean }> = [
    { ok: d.title.trim().length > 0, key: "jobTitle" },
    { ok: hasContent, key: "descriptionChecklist" },
    {
      ok: d.fields.salaryMin != null || d.fields.salaryMax != null,
      key: "salaryRange",
      optional: true,
    },
    { ok: d.keywords.length > 0, key: "keywords", optional: true },
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
            {t(`status.${status}`)}
          </p>
        </div>
        <p className="mt-1 font-display text-[18px] leading-tight text-near-ink">
          {d.title.trim() || t("yourJobTitle")}
        </p>
      </div>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-2 text-[13px]">
            <span
              className={cn(
                "flex size-4.5 items-center justify-center rounded-full transition-colors duration-200",
                i.ok ? "bg-success-olive text-pure-snow" : "bg-soft-kraft text-transparent",
              )}
            >
              <Check className="size-3" strokeWidth={3} />
            </span>
            <span className={i.ok ? "text-near-ink" : "text-soft-ink"}>
              {i.optional && !i.ok
                ? t("reviewOptional", { item: t(`review.${i.key}`) })
                : t(`review.${i.key}`)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[12.5px] text-soft-ink">
        {t("requiredFields", { count: required + 2 })}
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
  const t = useTranslations("jobs.stepPreview");
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
            <p className="mb-4 text-[12.5px] font-semibold text-soft-ink">{t(`title.${step}`)}</p>
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
