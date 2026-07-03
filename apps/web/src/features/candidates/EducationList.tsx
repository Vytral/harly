import type { ResumeEducationItem } from "@harly/db";

/** Structured résumé education list with string fallback for older parsed files. */
export function EducationList({
  education,
  fallback,
}: {
  education: ResumeEducationItem[];
  fallback: string | null;
}) {
  if (education.length === 0 && !fallback) return null;

  return (
    <section className="rounded-xl border bg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Education
      </h3>
      <div className="mt-3 space-y-3">
        {education.length > 0 ? (
          education.map((item, index) => (
            <div key={`${item.school}-${item.degree ?? "degree"}-${index}`} className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
              <div className="text-sm text-muted-foreground">{item.dateRange ?? "—"}</div>
              <div>
                <p className="font-medium">
                  {[item.degree, item.field].filter(Boolean).join(" · ") || "Education"}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{item.school}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm font-medium">{fallback}</p>
        )}
      </div>
    </section>
  );
}
