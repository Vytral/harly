import Link from "next/link";
import { notFound } from "next/navigation";
import parse from "html-react-parser";

import { BoardShell, BoardTopBar, BoardJobHeader } from "@/features/board/components";
import { getPublicJobDetail } from "@/features/jobs/data";
import {
  normalizeJobBoardConfig,
  parseJobContentSections,
  parseKeywords,
  parseOfficePhotos,
} from "@/features/jobs/config";

export const dynamic = "force-dynamic";

type JobDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { slug } = await params;
  const detail = await getPublicJobDetail({ jobSlug: slug });

  if (!detail) notFound();

  const { job, workspace } = detail;
  const boardConfig = normalizeJobBoardConfig(job.boardConfig);

  const brandedWorkspace = {
    ...workspace,
    name: boardConfig.brandName ?? workspace.name,
    primaryColor: boardConfig.accentColor ?? workspace.primaryColor,
  };

  const boardRoot = "/";

  const sections = parseJobContentSections(job.contentSections);
  const officePhotos = parseOfficePhotos(job.officePhotos);
  const keywords = parseKeywords(job.keywords);
  const mapSrc = job.officeAddress
    ? `https://maps.google.com/maps?q=${encodeURIComponent(job.officeAddress)}&z=14&output=embed`
    : null;

  return (
    <BoardShell workspace={brandedWorkspace} boardRoot={boardRoot}>
      <BoardTopBar workspace={brandedWorkspace} boardRoot={boardRoot} backHref="/" />
      <BoardJobHeader workspace={brandedWorkspace} boardRoot={boardRoot} job={job} activeTab="overview" />

      <main className="board-page-enter mx-auto max-w-3xl px-6 py-12">
        <article className="space-y-10 text-sm leading-7 text-zinc-700">
          <section>
            <h2 className="text-base font-semibold text-zinc-900">
              About this role
            </h2>
            <JobContent content={job.description} />
          </section>

          {sections.length > 0
            ? sections.map((section) => (
                <section key={section.id}>
                  {section.title ? (
                    <h2 className="text-base font-semibold text-zinc-900">
                      {section.title}
                    </h2>
                  ) : null}
                  <JobContent content={section.body} />
                </section>
              ))
            : (
              <>
                {job.requirements ? (
                  <section>
                    <h2 className="text-base font-semibold text-zinc-900">
                      Requirements
                    </h2>
                    <JobContent content={job.requirements} />
                  </section>
                ) : null}
                {job.benefits ? (
                  <section>
                    <h2 className="text-base font-semibold text-zinc-900">
                      Benefits
                    </h2>
                    <JobContent content={job.benefits} />
                  </section>
                ) : null}
              </>
            )}

          {mapSrc || officePhotos.length > 0 ? (
            <section>
              <h2 className="text-base font-semibold text-zinc-900">Office</h2>
              {job.officeAddress ? (
                <p className="mt-2 text-zinc-600">{job.officeAddress}</p>
              ) : null}
              {mapSrc ? (
                <iframe
                  src={mapSrc}
                  title="Office location"
                  className="mt-3 h-64 w-full rounded-lg border border-zinc-200"
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
                      className="aspect-video w-full rounded-lg border border-zinc-200 object-cover"
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
                    className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </article>

        <div className="mt-12 flex flex-col items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-6 py-8 text-center">
          <p className="text-sm text-zinc-600">
            Interested? Apply to {brandedWorkspace.name} today.
          </p>
          <Link
            href={`/apply/${job.slug}`}
            className="inline-flex h-10 items-center rounded-md px-5 text-sm font-medium transition hover:brightness-110"
            style={{
              backgroundColor: "var(--board-primary)",
              color: "var(--board-primary-foreground)",
            }}
          >
            Apply now
          </Link>
        </div>
      </main>
    </BoardShell>
  );
}

function JobContent({ content }: { content: string }) {
  if (content.trimStart().startsWith("<")) {
    return <div className="prose-job mt-3">{parse(content)}</div>;
  }
  return <p className="mt-3 whitespace-pre-line">{content}</p>;
}
