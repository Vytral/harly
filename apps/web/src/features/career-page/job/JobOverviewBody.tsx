import parse from "html-react-parser";

import {
  parseJobContentSections,
  parseKeywords,
  parseOfficePhotos,
} from "@/features/jobs/config";

type JobLike = {
  description: string;
  requirements?: string | null;
  benefits?: string | null;
  contentSections?: unknown;
  officePhotos?: unknown;
  officeAddress?: string | null;
  keywords?: unknown;
};

function JobContent({ content }: { content: string }) {
  if (content.trimStart().startsWith("<")) {
    return <div className="prose-job mt-3">{parse(content)}</div>;
  }
  return <p className="mt-3 whitespace-pre-line">{content}</p>;
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
      {children}
    </h2>
  );
}

/**
 * Template-agnostic job overview content (description, custom sections,
 * requirements/benefits, office, keywords). Theme-aware so it reads correctly
 * inside any career template and in dark mode. The surrounding chrome (header,
 * meta column, tabs) is supplied by the per-template shell.
 */
export function JobOverviewBody({ job }: { job: JobLike }) {
  const sections = parseJobContentSections(job.contentSections);
  const officePhotos = parseOfficePhotos(job.officePhotos);
  const keywords = parseKeywords(job.keywords);
  const mapSrc = job.officeAddress
    ? `https://maps.google.com/maps?q=${encodeURIComponent(job.officeAddress)}&z=14&output=embed`
    : null;

  return (
    <article className="space-y-10 text-base leading-7 text-zinc-600 dark:text-zinc-300">
      <section>
        <Heading>About this role</Heading>
        <JobContent content={job.description} />
      </section>

      {sections.length > 0 ? (
        sections.map((section) => (
          <section key={section.id}>
            {section.title ? <Heading>{section.title}</Heading> : null}
            <JobContent content={section.body} />
          </section>
        ))
      ) : (
        <>
          {job.requirements ? (
            <section>
              <Heading>Requirements</Heading>
              <JobContent content={job.requirements} />
            </section>
          ) : null}
          {job.benefits ? (
            <section>
              <Heading>Benefits</Heading>
              <JobContent content={job.benefits} />
            </section>
          ) : null}
        </>
      )}

      {mapSrc || officePhotos.length > 0 ? (
        <section>
          <Heading>Office</Heading>
          {job.officeAddress ? (
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">{job.officeAddress}</p>
          ) : null}
          {mapSrc ? (
            <iframe
              src={mapSrc}
              title="Office location"
              className="mt-3 h-64 w-full rounded-lg border border-zinc-200 dark:border-zinc-800"
              loading="lazy"
            />
          ) : null}
          {officePhotos.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {officePhotos.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt="Office"
                  className="aspect-video w-full rounded-lg border border-zinc-200 object-cover dark:border-zinc-800"
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {keywords.length > 0 ? (
        <section>
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <span
                key={kw}
                className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {kw}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
