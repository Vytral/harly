import type { CandidateExperienceEntry, ResumeExperienceItem } from "@harly/db";

function isStructuredEntry(
  item: ResumeExperienceItem | CandidateExperienceEntry,
): item is CandidateExperienceEntry {
  return "id" in item;
}

function formatMonth(value: string | null | undefined) {
  if (!value) return null;
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateRange(item: CandidateExperienceEntry) {
  const start = formatMonth(item.startDate);
  const end = item.current ? "Present" : formatMonth(item.endDate);
  if (start && end) return `${start} - ${end}`;
  if (start) return `${start} - ${item.current ? "Present" : "Not set"}`;
  if (end) return end;
  return "Not set";
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
  if (experience.length === 0) return null;

  return (
    <div className="space-y-5">
      {experience.map((item, index) => (
        <div
          key={isStructuredEntry(item) ? item.id : `${item.company}-${item.title}-${index}`}
          className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]"
        >
          <div className="text-sm text-muted-foreground">
            {isStructuredEntry(item) ? formatDateRange(item) : item.dateRange ?? "Not set"}
          </div>
          <div className="min-w-0">
            <p className="font-medium leading-snug">
              {item.title} <span className="text-muted-foreground">at</span> {item.company}
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
