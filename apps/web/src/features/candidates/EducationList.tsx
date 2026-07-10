import type { CandidateEducationEntry, ResumeEducationItem } from "@harly/db";

function isStructuredEntry(
  item: ResumeEducationItem | CandidateEducationEntry,
): item is CandidateEducationEntry {
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

function formatDateRange(item: CandidateEducationEntry) {
  const start = formatMonth(item.startDate);
  const end = formatMonth(item.endDate);
  if (start && end) return `${start} - ${end}`;
  if (start) return `${start} - —`;
  if (end) return end;
  return "—";
}

/**
 * Education rows. Returns `null` when there's no data so the parent panel
 * can hide the whole section. The outer border/padding is provided by the
 * unified details panel — keep this borderless.
 */
export function EducationList({
  education,
  fallback,
}: {
  education: Array<ResumeEducationItem | CandidateEducationEntry>;
  fallback: string | null;
}) {
  if (education.length === 0 && !fallback) return null;

  return (
    <div className="space-y-3">
      {education.length > 0 ? (
        education.map((item, index) => (
          <div
            key={isStructuredEntry(item) ? item.id : `${item.school}-${item.degree ?? "degree"}-${index}`}
            className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]"
          >
            <div className="text-sm text-muted-foreground">
              {isStructuredEntry(item) ? formatDateRange(item) : item.dateRange ?? "—"}
            </div>
            <div>
              <p className="font-medium">
                {[item.degree, item.field].filter(Boolean).join(" · ") || "Education"}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">{item.school}</p>
              {isStructuredEntry(item) && item.description ? (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.description}
                </p>
              ) : null}
            </div>
          </div>
        ))
      ) : (
        <p className="text-sm font-medium">{fallback}</p>
      )}
    </div>
  );
}
