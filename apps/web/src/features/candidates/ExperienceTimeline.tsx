import type { ResumeExperienceItem } from "@harly/db";

/** Workable-style résumé experience timeline. */
export function ExperienceTimeline({
  experience,
}: {
  experience: ResumeExperienceItem[];
}) {
  if (experience.length === 0) return null;

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-4 flex flex-wrap items-baseline gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Work experience
        </h3>
        <span className="text-xs text-muted-foreground">{experience.length} entries</span>
      </div>
      <div className="space-y-5">
        {experience.map((item, index) => (
          <div key={`${item.company}-${item.title}-${index}`} className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <div className="text-sm text-muted-foreground">{item.dateRange ?? "—"}</div>
            <div className="min-w-0">
              <p className="font-medium leading-snug">
                {item.title} <span className="text-muted-foreground">at</span> {item.company}
              </p>
              {item.bullets.length > 0 ? (
                <ul className="mt-2 space-y-1.5 text-sm leading-6 text-muted-foreground">
                  {item.bullets.map((bullet) => (
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
    </section>
  );
}
