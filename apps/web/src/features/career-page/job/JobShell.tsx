"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";

import { isLightColor, type CareerPageConfig } from "../config";
import { CareerFooter } from "../CareerFooter";
import { buildJobMeta, type JobLike } from "./jobMeta";

const reveal =
  "duration-300 animate-in fade-in fill-mode-backwards motion-reduce:animate-none";

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
  playful,
  children,
}: {
  config: CareerPageConfig;
  workspace: WorkspaceBoardBranding & { id: string };
  job: JobLike;
  boardRoot: string;
  activeTab: "overview" | "application";
  playful: boolean;
  children: React.ReactNode;
}) {
  const accent = config.theme.accent ?? workspace.primaryColor;
  const onAccent = isLightColor(accent) ? "#18181b" : "#ffffff";
  const base = boardRoot === "/" ? "" : boardRoot;
  const overviewHref = `${base}/jobs/${job.slug}` as Route;
  const applyHref = `${base}/apply/${job.slug}` as Route;
  const meta = buildJobMeta(job);
  const logo = workspace.logoUrl;

  const heroImage = config.hero.imageUrl ?? workspace.heroImageUrl;
  // Gradient is an image wash only — never a stray fade over a plain accent.
  const showGradient = config.hero.overlay === "gradient" && Boolean(heroImage);
  const overlayFrom = config.hero.overlayFrom ?? `${accent}E6`;
  const overlayTo = config.hero.overlayTo ?? `${accent}00`;
  const radius = config.theme.rounded === "sharp" ? "rounded-none" : "rounded-lg";

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

    const activeLink = tabRefs.current[activeTab];
    if (activeLink && navRef.current && indicatorRef.current) {
      const navRect = navRef.current.getBoundingClientRect();
      const currentRect = activeLink.getBoundingClientRect();
      const targetLeft = currentRect.left - navRect.left;
      const targetWidth = currentRect.width;

      if (prevTab && prevTab !== activeTab) {
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
    <div className="flex min-h-screen flex-col text-zinc-900 dark:text-zinc-100">
      {playful ? (
        <header className="relative">
          <div
            className="relative h-40 w-full overflow-hidden sm:h-44"
            style={
              heroImage
                ? { backgroundImage: `url(${heroImage})`, backgroundSize: "cover", backgroundPosition: "center" }
                : { backgroundColor: accent }
            }
          >
            {showGradient && (
              <div
                className="absolute inset-0"
                style={{ background: `linear-gradient(90deg, ${overlayFrom} 0%, ${overlayTo} 100%)` }}
              />
            )}
            <div className="absolute inset-x-0 top-0 mx-auto max-w-5xl px-6 pt-5">
              <Link
                href={(boardRoot || "/") as Route}
                className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-80"
                style={{ color: heroImage || showGradient ? "#ffffff" : onAccent }}
              >
                <ArrowLeft className="size-4" strokeWidth={2} />
                {workspace.name}
              </Link>
            </div>
          </div>
          <div className="mx-auto max-w-5xl px-6">
            <div className="relative -mt-9 flex size-[72px] items-center justify-center overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={workspace.name} className="size-full object-cover" />
              ) : (
                <span className="text-2xl font-semibold" style={{ color: accent }}>
                  {workspace.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
          </div>
        </header>
      ) : (
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex max-w-5xl items-center gap-2 px-6 py-4">
            <Link
              href={(boardRoot || "/") as Route}
              className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <ArrowLeft className="size-4" strokeWidth={1.8} />
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={workspace.name} className="size-6 rounded object-contain" />
              ) : null}
              {workspace.name}
            </Link>
          </div>
        </header>
      )}

      <div className={cn("mx-auto w-full max-w-5xl flex-1 px-6 pb-20", playful ? "pt-6" : "pt-10")}>
        <h1
          className={cn("text-2xl font-semibold tracking-tight sm:text-3xl", reveal)}
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
            <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {meta.map((m) => (
                <div key={m.label} className="py-3.5 first:pt-0">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    {m.label}
                  </dt>
                  <dd className="mt-1 text-sm font-medium leading-snug">{m.value}</dd>
                </div>
              ))}
            </dl>
            {activeTab === "application" ? (
              <dl className="pt-1">
                <div className="border-t border-zinc-200 py-3.5 dark:border-zinc-800">
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    Position
                  </dt>
                  <dd className="mt-1 text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-100">
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
          <main className={cn("min-w-0", reveal)} style={{ animationDelay: "120ms" }}>
            <nav ref={navRef} className="relative flex gap-8 border-b border-zinc-200 text-sm font-medium dark:border-zinc-800">
              {tabs.map((t) => {
                const on = activeTab === t.tab;
                return (
                  <Link
                    key={t.tab}
                    ref={(el) => { tabRefs.current[t.tab] = el; }}
                    href={t.href}
                    className={cn(
                      "pb-3 transition-colors",
                      on
                        ? ""
                        : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                    )}
                    style={on ? { color: accent } : undefined}
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
                  backgroundColor: accent,
                  left: 0,
                  width: 0,
                }}
              />
            </nav>

            <div className="mt-8">{children}</div>
          </main>
        </div>
      </div>

      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="py-6">
          <CareerFooter
            config={config}
            workspaceName={workspace.name}
            maxWidth="max-w-5xl"
          />
        </div>
      </footer>
    </div>
  );
}
