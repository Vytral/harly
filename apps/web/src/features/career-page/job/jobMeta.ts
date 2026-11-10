import { formatEmploymentType, formatWorkplaceType } from "@/lib/format";
import type { Translate } from "@/features/career-page/translate";

/** The job fields the public template chrome reads. Loose by design , the row
 *  from `getPublicJobDetail` is a superset. */
export type JobLike = {
  slug: string;
  title: string;
  department: string | null;
  location: string | null;
  employmentType: string;
  workplaceType: string;
  experienceLevel?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency?: string | null;
  salaryPeriod?: string | null;
};

/** Human compensation string, or null when no salary is set. `t` is `labels.careerPage.jobMeta`. */
export function formatCompensation(job: JobLike, locale: string, t: Translate): string | null {
  if (job.salaryMin == null && job.salaryMax == null) return null;
  const currency = job.currency || "USD";
  const fmt = (n: number) => {
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return `${currency} ${n.toLocaleString(locale)}`;
    }
  };
  const range =
    job.salaryMin != null && job.salaryMax != null
      ? `${fmt(job.salaryMin)} – ${fmt(job.salaryMax)}`
      : fmt((job.salaryMin ?? job.salaryMax)!);
  const period = t(job.salaryPeriod === "monthly" ? "perMonth" : "perYear");
  return `${range}${period}`;
}

export type JobMetaItem = { label: string; value: string };

/** Ordered left-column meta for the structured/playful job chrome. */
export function buildJobMeta(job: JobLike, locale: string, t: Translate): JobMetaItem[] {
  const items: JobMetaItem[] = [];
  if (job.location) items.push({ label: t("location"), value: job.location });
  items.push({ label: t("workplace"), value: formatWorkplaceType(job.workplaceType) });
  items.push({ label: t("employment"), value: formatEmploymentType(job.employmentType) });
  if (job.department) items.push({ label: t("department"), value: job.department });
  if (job.experienceLevel)
    items.push({ label: t("experience"), value: job.experienceLevel });
  const comp = formatCompensation(job, locale, t);
  if (comp) items.push({ label: t("compensation"), value: comp });
  return items;
}
