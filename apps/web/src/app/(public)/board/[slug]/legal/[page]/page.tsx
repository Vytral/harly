import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getLegalPageData } from "@/features/legal/data";
import { renderMarkdown } from "@/features/legal/render-markdown";

export const dynamic = "force-dynamic";

type LegalPageProps = {
  params: Promise<{ slug: string; page: string }>;
};

export async function generateMetadata({
  params,
}: LegalPageProps): Promise<Metadata> {
  const { slug, page } = await params;
  const data = await getLegalPageData(slug, page);
  if (!data) return {};
  return {
    title: `${data.pageTitle} — ${data.workspaceName}`,
  };
}

export default async function LegalPage({ params }: LegalPageProps) {
  const { slug, page } = await params;
  const data = await getLegalPageData(slug, page);

  if (!data) {
    notFound();
  }

  const html = renderMarkdown(data.content);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <nav className="mb-8 text-xs text-muted-foreground">
        <a href={`/board/${data.workspaceSlug}`} className="hover:text-foreground">
          {data.workspaceName}
        </a>
        <span className="mx-2">/</span>
        <span>{data.pageTitle}</span>
      </nav>

      <article
        className="prose prose-sm max-w-none text-foreground prose-headings:tracking-tight prose-a:text-pine prose-strong:text-foreground"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
        <a href={`/board/${data.workspaceSlug}`} className="hover:text-foreground">
          ← Back to {data.workspaceName} careers
        </a>
      </footer>
    </div>
  );
}
