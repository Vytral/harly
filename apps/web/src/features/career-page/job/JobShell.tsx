"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, Briefcase, Building2, Check, Link2, MapPin, Wallet } from "lucide-react";

import { cn, copyText } from "@/lib/utils";
import { formatEmploymentType, formatWorkplaceType } from "@/lib/format";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";

import type { CareerPageConfig } from "../config";
import { boardBase } from "../job-filters";
import { withAlpha } from "../color";
import { careerTheme } from "../theme";
import { CareerFooter } from "../CareerFooter";
import { buildJobMeta, formatCompensation, type JobLike } from "./jobMeta";

const reveal =
  "duration-300 animate-in fade-in fill-mode-backwards motion-reduce:animate-none";

export type JobShellVariant = "playful" | "structured" | "join";

/**
 * Unified public job chrome, built on the Ashby distribution: title top-left, a
 * left meta column (divided label/value rows, no boxes) and a right content
 * column whose tabs sit at its head. Every template shares this layout for a
 * tight, gap-free result; `playful` adds a hero band + accent flavour, the flat
 * variant stays minimal. Accent only colours the active tab + apply button.
 */
export function JobShell({
  config,
  workspace,
  job,
  boardRoot,
  activeTab,
  variant,
  portalEnabled = false,
  children,
}: {
  config: CareerPageConfig;
  workspace: WorkspaceBoardBranding & { id: string };
  job: JobLike;
  boardRoot: string;
  activeTab: "overview" | "application";
  variant: JobShellVariant;
  portalEnabled?: boolean;
  children: React.ReactNode;
}) {
  const theme = careerTheme(config, workspace.primaryColor);
  const { accent, onAccent, accentText } = theme;
  const base = boardBase(boardRoot);
  // The job page keeps the width of the list page it came from.
  const widthClass =
    config.template === "ashby"
      ? "max-w-6xl"
      : config.template === "playful"
        ? "max-w-5xl"
        : "max-w-4xl";
  const overviewHref = `${base}/jobs/${job.slug}` as Route;
  const applyHref = `${base}/apply/${job.slug}` as Route;
  const meta = buildJobMeta(job);
  // Honour hero.logoType here too, so the wordmark choice carries to job pages.
  const logo =
    config.hero.logoType === "fullLogo"
      ? (workspace.fullLogoUrl ?? workspace.logoUrl)
      : workspace.logoUrl;
  const showName = config.hero.showName || !logo;

  const heroImage = config.hero.imageUrl ?? workspace.heroImageUrl;
  // Gradient is an image wash only , never a stray fade over a plain accent.
  const showGradient = config.hero.overlay === "gradient" && Boolean(heroImage);
  const overlayFrom = config.hero.overlayFrom ?? withAlpha(accent, 0.9);
  const overlayTo = config.hero.overlayTo ?? withAlpha(accent, 0);
  const radius = "rounded-[var(--career-r-btn,10px)]";

  // ── Animated tab indicator ──
  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const indicatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prevJob = sessionStorage.getItem("harly_prev_tab_job");
    const prevTab = sessionStorage.getItem("harly_prev_tab");

    sessionStorage.setItem("harly_prev_tab_job", job.slug);
    sessionStorage.setItem("harly_prev_tab", activeTab);

    // If it's a tab switch on the same job, temporarily disable page reveal animations
    let cleanupTimer: NodeJS.Timeout | null = null;
    if (prevJob === job.slug && prevTab && prevTab !== activeTab) {
      document.documentElement.setAttribute("data-tab-switch", "true");
      cleanupTimer = setTimeout(() => {
        document.documentElement.removeAttribute("data-tab-switch");
      }, 800);
    } else {
      document.documentElement.removeAttribute("data-tab-switch");
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const activeLink = tabRefs.current[activeTab];
    if (activeLink && navRef.current && indicatorRef.current) {
      const navRect = navRef.current.getBoundingClientRect();
      const currentRect = activeLink.getBoundingClientRect();
      const targetLeft = currentRect.left - navRect.left;
      const targetWidth = currentRect.width;

      if (prevTab && prevTab !== activeTab && !reduceMotion) {
        const prevLink = tabRefs.current[prevTab];
        if (prevLink) {
          const prevRect = prevLink.getBoundingClientRect();
          const prevLeft = prevRect.left - navRect.left;
          const prevWidth = prevRect.width;

          // 1. Set to previous position instantly (transition: none)
          indicatorRef.current.style.transition = "none";
          indicatorRef.current.style.left = `${prevLeft}px`;
          indicatorRef.current.style.width = `${prevWidth}px`;

          // 2. Force reflow to flush styles to DOM
          void indicatorRef.current.offsetHeight;

          // 3. Animate to target in the next frame
          requestAnimationFrame(() => {
            if (indicatorRef.current) {
              indicatorRef.current.style.transition =
                "left 300ms cubic-bezier(0.23, 1, 0.32, 1), width 300ms cubic-bezier(0.23, 1, 0.32, 1)";
              indicatorRef.current.style.left = `${targetLeft}px`;
              indicatorRef.current.style.width = `${targetWidth}px`;
            }
          });
        } else {
          indicatorRef.current.style.transition = "none";
          indicatorRef.current.style.left = `${targetLeft}px`;
          indicatorRef.current.style.width = `${targetWidth}px`;
        }
      } else {
        // Direct set: fresh page load or same tab
        indicatorRef.current.style.transition = "none";
        indicatorRef.current.style.left = `${targetLeft}px`;
        indicatorRef.current.style.width = `${targetWidth}px`;
      }
    }

    return () => {
      if (cleanupTimer) clearTimeout(cleanupTimer);
      document.documentElement.removeAttribute("data-tab-switch");
    };
  }, [activeTab, job.slug]);

  const tabs = [
    { tab: "overview", label: "Overview", href: overviewHref },
    { tab: "application", label: "Application", href: applyHref },
  ] as const;

  return (
    <div className="flex min-h-screen flex-col text-near-ink" style={theme.vars}>
      {variant === "playful" ? (
        <header className="relative">
          <div
            className="relative h-40 w-full overflow-hidden sm:h-44"
            style={
              heroImage
                ? {
                    backgroundImage: `url(${heroImage})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : { backgroundColor: accent }
            }
          >
            {showGradient && (
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(90deg, ${overlayFrom} 0%, ${overlayTo} 100%)`,
                }}
              />
            )}
            <div className={cn("absolute inset-x-0 top-0 mx-auto px-6 pt-5", widthClass)}>
              <Link
                href={(boardRoot || "/") as Route}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90"
                style={
                  heroImage
                    ? { color: "#ffffff", backgroundColor: "rgba(0, 0, 0, 0.45)" }
                    : { color: onAccent }
                }
              >
                <ArrowLeft className="size-4" strokeWidth={2} />
                {workspace.name}
              </Link>
            </div>
          </div>
          <div className={cn("mx-auto px-6", widthClass)}>
            {/* Logo plate is always white: workspace logos are drawn for a light ground. */}
            <div className="relative -mt-9 flex size-[72px] items-center justify-center overflow-hidden rounded-[var(--career-r-card,16px)] border border-hairline bg-white shadow-lg">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logo}
                  alt={workspace.name}
                  className="size-full object-contain p-2"
                />
              ) : (
                <span
                  className="text-2xl font-semibold"
                  style={{ color: "var(--career-accent)" }}
                >
                  {workspace.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
          </div>
        </header>
      ) : (
        <header className="border-b border-hairline">
          <div className={cn("mx-auto flex items-center gap-2 px-6 py-4", widthClass)}>
            <Link
              href={(boardRoot || "/") as Route}
              className="inline-flex items-center gap-2 text-sm font-medium text-soft-ink transition-colors hover:text-near-ink"
            >
              <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden />
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logo}
                  alt={showName ? "" : workspace.name}
                  className={
                    config.hero.logoType === "fullLogo"
                      ? "h-6 w-auto max-w-[160px] object-contain"
                      : "size-6 rounded object-contain"
                  }
                />
              ) : null}
              {showName ? workspace.name : null}
            </Link>
          </div>
        </header>
      )}

      {variant === "join" ? (
        <JoinJobContent
          job={job}
          title={job.title}
          accent={accent}
          onAccent={onAccent}
          widthClass={widthClass}
          activeTab={activeTab}
          applyHref={applyHref}
          overviewHref={overviewHref}
        >
          {children}
        </JoinJobContent>
      ) : (
        <div
          className={cn(
            "mx-auto w-full flex-1 px-6 pb-20",
            widthClass,
            variant === "playful" ? "pt-6" : "pt-10",
          )}
        >
          <h1
            className={cn(
              "text-2xl font-semibold tracking-tight sm:text-3xl",
              reveal,
            )}
            style={{ animationDelay: "0ms" }}
          >
            {job.title}
          </h1>

          <div className="mt-8 grid gap-x-12 gap-y-8 lg:grid-cols-[232px_minmax(0,1fr)]">
            {/* Meta column */}
            <aside
              className={cn("lg:sticky lg:top-8 lg:self-start", reveal)}
              style={{ animationDelay: "80ms" }}
            >
              <dl className="divide-y divide-hairline">
                {meta.map((m) => (
                  <div key={m.label} className="py-3.5 first:pt-0">
                    <dt className="text-xs font-medium uppercase tracking-wide text-soft-ink">
                      {m.label}
                    </dt>
                    <dd className="mt-1 text-sm font-medium leading-snug">
                      {m.value}
                    </dd>
                  </div>
                ))}
              </dl>
              {activeTab === "application" ? (
                <dl className="pt-1">
                  <div className="border-t border-hairline py-3.5">
                    <dt className="text-xs font-medium uppercase tracking-wide text-soft-ink">
                      Position
                    </dt>
                    <dd className="mt-1 text-sm font-medium leading-snug text-near-ink">
                      {job.title}
                    </dd>
                  </div>
                </dl>
              ) : null}
              {activeTab === "overview" ? (
                <Link
                  href={applyHref}
                  className={cn(
                    "mt-6 inline-flex h-10 w-full items-center justify-center px-5 text-sm font-semibold transition-transform duration-150 active:scale-[0.98]",
                    radius,
                  )}
                  style={{ backgroundColor: accent, color: onAccent }}
                >
                  Apply for this role
                </Link>
              ) : null}
            </aside>

            {/* Content column */}
            <main
              className={cn("min-w-0", reveal)}
              style={{ animationDelay: "120ms" }}
            >
              <nav
                ref={navRef}
                className="relative flex gap-8 border-b border-hairline text-sm font-medium"
              >
                {tabs.map((t) => {
                  const on = activeTab === t.tab;
                  return (
                    <Link
                      key={t.tab}
                      ref={(el) => {
                        tabRefs.current[t.tab] = el;
                      }}
                      href={t.href}
                      className={cn(
                        "pb-3 transition-colors",
                        on
                          ? ""
                          : "text-soft-ink hover:text-near-ink",
                      )}
                      aria-current={on ? "page" : undefined}
                      style={on ? { color: accentText } : undefined}
                    >
                      {t.label}
                    </Link>
                  );
                })}
                {/* Animated indicator bar */}
                <div
                  ref={indicatorRef}
                  className="absolute bottom-0 h-0.5 rounded-full"
                  style={{
                    backgroundColor: accentText,
                    left: 0,
                    width: 0,
                  }}
                />
              </nav>

              <div className="mt-8">{children}</div>
            </main>
          </div>
        </div>
      )}

      <footer className="border-t border-hairline">
        {variant === "join" && (
          <div className={cn("mx-auto px-6 pt-6 text-xs text-soft-ink", widthClass)}>
            <Link href={(boardRoot || "/") as Route} className="hover:text-near-ink">
              Home
            </Link>
            <span className="mx-1.5">/</span>
            <Link href={(boardRoot || "/") as Route} className="hover:text-near-ink">
              Jobs at {workspace.name}
            </Link>
            <span className="mx-1.5">/</span>
            <span>{job.title}</span>
          </div>
        )}
        <div className="py-6">
          <CareerFooter
            config={config}
            workspaceName={workspace.name}
            maxWidth={widthClass}
            portalEnabled={portalEnabled}
            legalBasePath={`${base}/legal`}
          />
        </div>
      </footer>
    </div>
  );
}

/**
 * join.com-style job body: meta as an inline icon row under the title (not a
 * stacked left column), main content full-width, and a slim sticky sidebar
 * carrying just the primary action (Apply) + a copy-link share — the two
 * things join.com keeps visible while reading a long posting. No tab nav:
 * the sidebar CTA is the overview→application switch, so a second nav would
 * be redundant chrome.
 */
function JoinJobContent({
  job,
  title,
  accent,
  onAccent,
  widthClass,
  activeTab,
  applyHref,
  overviewHref,
  children,
}: {
  job: JobLike;
  title: string;
  accent: string;
  onAccent: string;
  widthClass: string;
  activeTab: "overview" | "application";
  applyHref: Route;
  overviewHref: Route;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const comp = formatCompensation(job);

  async function copyLink() {
    try {
      // Always share the job details (overview) URL — never the apply form,
      // even when the candidate is currently on the Application tab.
      const detailsUrl = new URL(overviewHref, window.location.origin).href;
      await copyText(detailsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access denied , nothing to recover, the button just won't confirm.
    }
  }

  return (
    <div className={cn("mx-auto w-full flex-1 px-6 pb-20 pt-10", widthClass)}>
      <h1 className={cn("text-2xl font-semibold tracking-tight sm:text-3xl", reveal)}>
        {title}
      </h1>

      <div
        className={cn("mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-soft-ink", reveal)}
        style={{ animationDelay: "40ms" }}
      >
        <span className="flex items-center gap-1.5">
          <MapPin className="size-3.5" strokeWidth={1.8} />
          {job.location ?? formatWorkplaceType(job.workplaceType)}
        </span>
        <span className="flex items-center gap-1.5">
          <Briefcase className="size-3.5" strokeWidth={1.8} />
          {formatEmploymentType(job.employmentType)}
        </span>
        {job.department && (
          <span className="flex items-center gap-1.5">
            <Building2 className="size-3.5" strokeWidth={1.8} />
            {job.department}
          </span>
        )}
        {comp && (
          <span className="flex items-center gap-1.5">
            <Wallet className="size-3.5" strokeWidth={1.8} />
            {comp}
          </span>
        )}
      </div>

      <div className="mt-8 grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_240px]">
        <main className={cn("min-w-0", reveal)} style={{ animationDelay: "100ms" }}>
          {children}
        </main>

        <aside className={cn("lg:sticky lg:top-8 lg:self-start", reveal)} style={{ animationDelay: "140ms" }}>
          {activeTab === "overview" ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-soft-ink">
                Interested?
              </p>
              <Link
                href={applyHref}
                className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-full px-5 text-sm font-semibold transition-transform duration-150 active:scale-[0.98] motion-reduce:transition-none"
                style={{ backgroundColor: accent, color: onAccent }}
              >
                Apply now
              </Link>
            </>
          ) : (
            <Link
              href={overviewHref}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-soft-ink transition-colors hover:text-near-ink"
            >
              <ArrowLeft className="size-3.5" strokeWidth={1.8} />
              Back to job
            </Link>
          )}

          <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-soft-ink">
            Share this job
          </p>
          <button
            type="button"
            onClick={copyLink}
            className={cn(
              "mt-3 inline-flex h-9 items-center gap-2 rounded-[var(--career-r-btn,10px)] border border-hairline px-3.5 text-sm font-medium text-soft-ink transition-colors hover:border-mist-border hover:text-near-ink",
            )}
          >
            {copied ? (
              <>
                <Check className="size-3.5" strokeWidth={2} />
                Copied
              </>
            ) : (
              <>
                <Link2 className="size-3.5" strokeWidth={1.8} />
                Copy link
              </>
            )}
          </button>
        </aside>
      </div>
    </div>
  );
}
