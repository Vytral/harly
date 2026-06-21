import Link from "next/link";
import type { Route } from "next";
import { MapPin } from "lucide-react";

import { formatEmploymentType, formatWorkplaceType } from "@/lib/format";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import type { CareerPageConfig } from "@/features/career-page/config";

type Job = {
  id: string;
  slug: string;
  title: string;
  department: string | null;
  location: string | null;
  employmentType: string;
  workplaceType: string;
};


/**
 * GreenhouseTemplate — classic corporate board. Wide hero banner, centered
 * "About" block, then open roles grouped into department sections with simple
 * rows. Serious, dense, no sidebar. Light/dark native.
 */
export function GreenhouseTemplate({
  workspace,
  jobs,
  config,
  boardRoot,
}: {
  workspace: WorkspaceBoardBranding & { id: string };
  jobs: Job[];
  config: CareerPageConfig;
  boardRoot: string;
}) {
  const accent = config.theme.accent ?? workspace.primaryColor;
  const headline = config.hero.headline || "Join our team";
  const heroImage = config.hero.imageUrl ?? workspace.heroImageUrl;
  const logo = workspace.logoUrl;

  // Group roles by department, departments alphabetical.
  const groups = (() => {
    const map = new Map<string, Job[]>();
    jobs.forEach((j) => {
      const key = j.department ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(j);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  })();

  return (
    <div className="text-zinc-900 dark:text-zinc-100">
      {/* Hero banner */}
      <header
        className="relative flex h-64 items-center justify-center overflow-hidden sm:h-80"
        style={
          heroImage
            ? { backgroundImage: `url(${heroImage})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { backgroundColor: accent }
        }
      >
        <div className="absolute inset-0 bg-zinc-900/45" />
        <div className={`relative px-6 flex flex-col ${
          config.hero.logoPosition === "center" ? "items-center text-center" :
          config.hero.logoPosition === "right" ? "items-end text-right" : "items-start text-left"
        }`}>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt={workspace.name}
              className={`h-12 w-auto object-contain ${config.hero.logoPosition === "center" ? "mx-auto" : ""} mb-5`}
            />
          )}
          {config.hero.showName && !logo ? (
            <p className="mb-3 text-sm font-medium text-white/70">{workspace.name}</p>
          ) : null}
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {headline}
          </h1>
          {config.hero.subhead && (
            <p className="mx-auto mt-3 max-w-2xl text-lg text-white/85">
              {config.hero.subhead}
            </p>
          )}
        </div>
      </header>

      {/* About */}
      {config.intro.body && (
        <section className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-3xl px-6 py-14 text-center">
            {config.overview.title && (
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                {config.overview.title}
              </h2>
            )}
            <p className="mt-4 whitespace-pre-line text-lg leading-relaxed text-zinc-700 dark:text-zinc-300">
              {config.intro.body}
            </p>
          </div>
        </section>
      )}

      {/* Open roles, grouped by department */}
      <section className="py-14 sm:py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            {config.positions.title}
          </h2>

          {groups.length === 0 ? (
            <p className="mt-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No open positions right now.
            </p>
          ) : (
            <div className="mt-10 space-y-12">
              {groups.map(([dept, deptJobs]) => (
                <div key={dept}>
                  <h3
                    className="border-b-2 pb-2 text-lg font-semibold tracking-tight"
                    style={{ borderColor: accent }}
                  >
                    {dept}
                  </h3>
                  <ul className="mt-1">
                    {deptJobs.map((job) => (
                      <li
                        key={job.id}
                        className="border-b border-zinc-100 dark:border-zinc-800"
                      >
                        <Link
                          href={`${boardRoot}/jobs/${job.slug}` as Route}
                          className="group flex items-center justify-between gap-4 py-4"
                        >
                          <span
                            className="font-medium text-zinc-800 transition-colors group-hover:opacity-80 dark:text-zinc-100"
                            style={{ color: accent }}
                          >
                            {job.title}
                          </span>
                          <span className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
                            <MapPin className="size-3.5" strokeWidth={1.8} />
                            {job.location ?? formatWorkplaceType(job.workplaceType) ?? "—"}
                            <span className="text-zinc-300 dark:text-zinc-600">·</span>
                            {formatEmploymentType(job.employmentType)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      {config.cta.enabled && config.cta.title && (
        <section className="border-t border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto max-w-3xl px-6 py-14 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              {config.cta.title}
            </h2>
            {config.cta.body && (
              <p className="mt-3 text-zinc-600 dark:text-zinc-400">{config.cta.body}</p>
            )}
            {workspace.websiteUrl && (
              <a
                href={workspace.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-block rounded-md px-6 py-2.5 text-sm font-semibold text-white transition-transform duration-150 active:scale-[0.98]"
                style={{ backgroundColor: config.cta.color ?? accent }}
              >
                Get in touch
              </a>
            )}
          </div>
        </section>
      )}

      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-3xl px-6 py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
          {workspace.name} · Powered by{" "}
          <a
            href="https://github.com/vytral/harly"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Harly
          </a>
        </div>
      </footer>
    </div>
  );
}
