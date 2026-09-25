import type { Route } from "next";

import { CookiePreferencesButton } from "@/components/CookiePreferencesButton";
import { LEGAL_PAGE_TITLES, type LegalIndexData } from "@/features/legal/data";

const PAGE_DESCRIPTIONS: Record<string, string> = {
  "privacy-policy": "How personal data is collected, used, and protected.",
  "terms-of-service": "The rules and terms for using this service.",
  "cookie-policy": "How cookies and similar technologies are used.",
  "candidate-notice": "Privacy information specific to job applicants.",
  "ai-transparency-notice": "How AI is used and reviewed in hiring decisions.",
};

/**
 * The /legal index: a branded landing that lists every published legal page.
 * Shares the header/footer/type treatment with LegalPageView so the two read
 * as one surface. Animates in on load (auth-card-enter / auth-stagger).
 */
export function LegalIndexView({
  data,
  legalBasePath,
  careersHref,
}: {
  data: LegalIndexData;
  legalBasePath: string;
  careersHref: string;
}) {
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
        <div className="auth-card-enter mb-10">
          <span className="inline-block rounded-full bg-sage/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-pine">
            Legal
          </span>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Legal &amp; privacy
          </h1>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
            The policies and notices that govern how {data.workspaceName}{" "}
            handles data and works with candidates.
          </p>
        </div>

        {data.publishedSlugs.length > 0 ? (
          <div className="auth-stagger grid gap-3 sm:grid-cols-2">
            {data.publishedSlugs.map((slug) => (
              <a
                key={slug}
                href={`${legalBasePath}/${slug}` as Route}
                className="group flex flex-col gap-1.5 rounded-2xl border border-hairline bg-paper-raised p-5 transition-[transform,border-color,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-[0_8px_30px_rgba(23,23,23,0.06)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-foreground">
                    {LEGAL_PAGE_TITLES[slug] ?? slug}
                  </h2>
                  <span
                    aria-hidden
                    className="text-muted-foreground transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {PAGE_DESCRIPTIONS[slug] ?? "Read the full document."}
                </p>
              </a>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[14rem] flex-col items-center justify-center rounded-2xl border border-dashed border-hairline bg-paper-raised px-6 py-12 text-center">
            <span className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-sage/40 text-pine">
              <ScaleIcon />
            </span>
            <h2 className="text-sm font-semibold text-foreground">
              No legal pages published yet
            </h2>
            <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">
              {data.workspaceName} hasn&apos;t published any legal documents.
              Check back later.
            </p>
          </div>
        )}
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
          <span>
            © {new Date().getFullYear()} {data.workspaceName}
          </span>
          <div className="flex items-center gap-4">
            <a href={careersHref as Route} className="transition hover:text-foreground">
              Careers
            </a>
            <CookiePreferencesButton className="hover:text-foreground" />
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

function ScaleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v18M7 21h10M5 7h14M5 7l-2.5 6a3 3 0 0 0 5 0L5 7Zm14 0-2.5 6a3 3 0 0 0 5 0L19 7ZM12 3a2 2 0 1 0 0 .01"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
