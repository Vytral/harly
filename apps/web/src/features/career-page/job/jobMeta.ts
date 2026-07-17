import { formatEmploymentType, formatWorkplaceType } from "@/lib/format";

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

/** Human compensation string, or null when no salary is set. */
export function formatCompensation(job: JobLike): string | null {
  if (job.salaryMin == null && job.salaryMax == null) return null;
  const currency = job.currency || "USD";
  const fmt = (n: number) => {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return `${currency} ${n.toLocaleString()}`;
    }
  };
  const range =
    job.salaryMin != null && job.salaryMax != null
      ? `${fmt(job.salaryMin)} – ${fmt(job.salaryMax)}`
      : fmt((job.salaryMin ?? job.salaryMax)!);
  const period = job.salaryPeriod === "monthly" ? "/mo" : "/yr";
  return `${range}${period}`;
}

export type JobMetaItem = { label: string; value: string };

/** Ordered left-column meta for the structured/playful job chrome. */
export function buildJobMeta(job: JobLike): JobMetaItem[] {
  const items: JobMetaItem[] = [];
  if (job.location) items.push({ label: "Location", value: job.location });
  items.push({ label: "Workplace", value: formatWorkplaceType(job.workplaceType) });
  items.push({ label: "Employment", value: formatEmploymentType(job.employmentType) });
  if (job.department) items.push({ label: "Department", value: job.department });
  if (job.experienceLevel)
    items.push({ label: "Experience", value: job.experienceLevel });
  const comp = formatCompensation(job);
  if (comp) items.push({ label: "Compensation", value: comp });
  return items;
}
