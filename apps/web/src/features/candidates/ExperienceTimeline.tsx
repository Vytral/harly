import type { CandidateExperienceEntry, ResumeExperienceItem } from "@harly/db";
import { useLocale, useTranslations } from "next-intl";

type Translator = ReturnType<typeof useTranslations>;

function isStructuredEntry(
  item: ResumeExperienceItem | CandidateExperienceEntry,
): item is CandidateExperienceEntry {
  return "id" in item;
}

function formatMonth(value: string | null | undefined, locale: string) {
  if (!value) return null;
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateRange(item: CandidateExperienceEntry, t: Translator, locale: string) {
  const start = formatMonth(item.startDate, locale);
  const end = item.current ? t("present") : formatMonth(item.endDate, locale);
  if (start && end) return t("dateRange", { start, end });
  if (start) return t("dateRange", { start, end: item.current ? t("present") : t("notSet") });
  if (end) return end;
  return t("notSet");
}

function descriptionBullets(value: string | null | undefined) {
  if (!value) return [];
  return value
    .split("\n")
    .map((line) => line.replace(/^[\s*-•]+/, "").trim())
    .filter(Boolean);
}

/**
 * Work experience rows. Renders nothing when empty so the parent panel can
 * hide the whole section (no orphan header). The outer border/padding is
 * provided by the unified details panel , keep this borderless.
 */
export function ExperienceTimeline({
  experience,
}: {
  experience: Array<ResumeExperienceItem | CandidateExperienceEntry>;
}) {
  const t = useTranslations("features.candidates.ExperienceTimeline");
  const locale = useLocale();
  if (experience.length === 0) return null;

  return (
    <div className="space-y-5">
      {experience.map((item, index) => (
        <div
          key={isStructuredEntry(item) ? item.id : `${item.company}-${item.title}-${index}`}
          className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]"
        >
          <div className="text-sm text-muted-foreground">
            {isStructuredEntry(item) ? formatDateRange(item, t, locale) : item.dateRange ?? t("notSet")}
          </div>
          <div className="min-w-0">
            <p className="font-medium leading-snug">
              {t.rich("roleAtCompany", {
                title: item.title,
                company: item.company,
                muted: (chunks) => <span className="text-muted-foreground">{chunks}</span>,
              })}
            </p>
            {isStructuredEntry(item) && item.location ? (
              <p className="mt-1 text-sm text-muted-foreground">{item.location}</p>
            ) : null}
            {(isStructuredEntry(item) ? descriptionBullets(item.description) : item.bullets).length > 0 ? (
              <ul className="mt-2 space-y-1.5 text-sm leading-6 text-muted-foreground">
                {(isStructuredEntry(item) ? descriptionBullets(item.description) : item.bullets).map((bullet) => (
                  <li key={bullet} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/50" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
