import type { Route } from "next";

import { LEGAL_PAGE_TITLES, type LegalPageData } from "@/features/legal/data";
import { isHtml, renderMarkdown } from "@/features/legal/render-markdown";

export function LegalPageView({
  data,
  legalBasePath,
  careersHref,
}: {
  data: LegalPageData;
  legalBasePath: string;
  careersHref: string;
}) {
  // Templates historically linked to /legal/*. Rewrite those internal links
  // when rendering a workspace-scoped board so they cannot cross tenants.
  const html = isHtml(data.content)
    ? data.content.replaceAll('href="/legal/', `href="${legalBasePath}/`)
    : renderMarkdown(
        data.content.replaceAll("](/legal/", `](${legalBasePath}/`),
      );
  const otherPages = data.publishedSlugs.filter(
    (slug) => slug !== data.pageSlug,
  );

  return (
    <div className="min-h-screen bg-paper text-foreground">
      <header className="sticky top-0 z-30 border-b border-hairline bg-paper/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <a
            href={careersHref as Route}
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            {data.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.logoUrl}
                alt={data.workspaceName}
                className="h-7 w-auto max-w-[120px] object-contain"
              />
            ) : (
              <span
                className="inline-flex size-7 items-center justify-center rounded-lg text-xs font-bold text-white"
                style={{ backgroundColor: data.primaryColor }}
              >
                {data.workspaceName.slice(0, 2).toUpperCase()}
              </span>
            )}
            <span className="text-sm font-semibold text-foreground">
              {data.workspaceName}
            </span>
          </a>
          <a
            href={careersHref as Route}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Careers
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-10">
          <span className="inline-block rounded-full bg-sage/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-pine">
            Legal
          </span>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {data.pageTitle}
          </h1>
          {data.websiteUrl && (
            <p className="mt-2 text-sm text-muted-foreground">
              {data.workspaceName} ·{" "}
              <a
                href={data.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {data.websiteUrl.replace(/^https?:\/\//, "")}
              </a>
            </p>
          )}
        </div>

        <article
          className="prose prose-sm max-w-none prose-headings:font-display prose-headings:tracking-tight prose-headings:text-foreground prose-h1:text-2xl prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3 prose-h3:text-base prose-h3:mt-6 prose-p:text-muted-foreground prose-p:leading-relaxed prose-li:text-muted-foreground prose-li:leading-relaxed prose-strong:text-foreground prose-strong:font-semibold prose-a:text-foreground prose-a:underline prose-a:underline-offset-2 prose-table:text-sm prose-td:text-muted-foreground prose-th:text-foreground [&_table]:border-collapse [&_td]:border [&_td]:border-hairline [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-hairline [&_th]:px-3 [&_th]:py-2 [&_th]:bg-kraft"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {otherPages.length > 0 && (
          <div className="mt-10 border-t border-hairline pt-8">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Other legal pages
            </p>
            <div className="flex flex-wrap gap-2">
              {otherPages.map((slug) => (
                <a
                  key={slug}
                  href={`${legalBasePath}/${slug}` as Route}
                  className="rounded-full border border-hairline bg-paper-raised px-4 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-foreground/20 hover:text-foreground"
                >
                  {LEGAL_PAGE_TITLES[slug] ?? slug}
                </a>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <span>
              © {new Date().getFullYear()} {data.workspaceName}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href={careersHref as Route}
              className="transition hover:text-foreground"
            >
              Careers
            </a>
            {data.websiteUrl && (
              <a
                href={data.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:text-foreground"
              >
                Website
              </a>
            )}
            <span className="text-hairline">·</span>
            <span>
              Powered by{" "}
              <a
                href="https://github.com/Vytral/harly"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground transition hover:text-pine"
              >
                Harly
              </a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
