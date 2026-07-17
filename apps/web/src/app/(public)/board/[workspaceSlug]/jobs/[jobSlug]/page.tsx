import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata, Route } from "next";
import parse from "html-react-parser";

import { JobChrome } from "@/features/career-page/job/JobChrome";
import { JobOverviewBody } from "@/features/career-page/job/JobOverviewBody";
import { isCareerPageConfigured } from "@/features/career-page/config";
import { jobPostingJsonLd, publicJobMetadata } from "@/features/career-page/seo";
import { getPublicJobDetail } from "@/features/jobs/data";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ workspaceSlug: string; jobSlug: string }> };

async function getDetail(params: Props["params"]) {
  const { workspaceSlug, jobSlug } = await params;
  return getPublicJobDetail({ workspaceSlug, jobSlug });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const detail = await getDetail(params);
  return detail ? publicJobMetadata(detail.workspace, detail.config, detail.job) : {};
}

export default async function BoardJobPage({ params }: Props) {
  const detail = await getDetail(params);
  if (!detail) notFound();
  const { workspaceSlug } = await params;
  const { job, workspace, config } = detail;
  const boardRoot = `/board/${workspaceSlug}`;
  const jsonLd = config.seo.indexable ? jobPostingJsonLd(workspace, job) : null;

  return (
    <>
      {jsonLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /> : null}
      {isCareerPageConfigured(config) ? (
        <JobChrome config={config} workspace={workspace} job={job} boardRoot={boardRoot} activeTab="overview"><JobOverviewBody job={job} /></JobChrome>
      ) : (
        <main className="mx-auto min-h-screen max-w-3xl px-6 py-14">
          <Link href={boardRoot as Route} className="text-sm text-muted-foreground hover:text-foreground">← All jobs</Link>
          <h1 className="mt-8 text-3xl font-semibold tracking-tight">{job.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{[job.location, job.department, job.workplaceType.replace("_", " ")].filter(Boolean).join(" · ")}</p>
          <article className="prose prose-sm mt-10 max-w-none">{parse(job.description)}</article>
          <Link href={`${boardRoot}/apply/${job.slug}` as Route} className="mt-10 inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">Apply now</Link>
        </main>
      )}
    </>
  );
}
