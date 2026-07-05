"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { Route } from "next";

import { cn } from "@/lib/utils";
import { formatEmploymentType, formatWorkplaceType } from "@/lib/format";
import type { WorkspaceBoardBranding } from "@/features/workspaces/board";
import type { CareerPageConfig, CareerTestimonial } from "@/features/career-page/config";
import type { Job } from "@/features/career-page/types";
import { CareerFooter } from "@/features/career-page/CareerFooter";

/* ------------------------------------------------------------------ */
/*  Ornamental SVGs — bespoke, not lucide                              */
/* ------------------------------------------------------------------ */

/** Fleurón — classic editorial leaf flourish, used between sections. */
function Fleuron({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 16" className={className} fill="none" aria-hidden>
      <path
        d="M2 8c6 0 10-4 14-4s8 4 14 4-10 4-14 4-8-4-14-4Zm60 0c-6 0-10-4-14-4s-8 4-14 4 10 4 14 4 8-4 14-4Z"
        fill="currentColor"
        opacity="0.55"
      />
      <path d="M32 2c2 2 2 4 0 6-2-2-2-4 0-6Zm0 8c2 2 2 4 0 6-2-2-2-4 0-6Z" fill="currentColor" />
    </svg>
  );
}

/** Asterismo — ⁂ three-asterisk mark, an editorial section break. */
function Asterism({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 16" className={className} fill="none" aria-hidden>
      {[4, 24, 44].map((cx) => (
        <g key={cx}>
          <path
            d={`M${cx} 2v12M${cx - 4} 5l8 6M${cx + 4} 5l-8 6`}
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            opacity="0.7"
          />
        </g>
      ))}
    </svg>
  );
}

/** Flecha editorial — serif terminal arrow for job rows (replaces lucide). */
function EditorialArrow({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" className={className} style={style} fill="none" aria-hidden>
      <path
        d="M5 12h13M13 7l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Ordinal numeral for numbered sections: 01 / 02 / 03 … */
function SectionMark({ n }: { n: number }) {
  return (
    <span className="font-mono text-xs tracking-[0.2em] text-folio-ink/55" aria-hidden>
      {String(n).padStart(2, "0")}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Hooks — reveal on scroll, reduced-motion aware                     */
/* ------------------------------------------------------------------ */

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduce;
}

/**
 * IntersectionObserver-driven reveal. Returns a ref + a visible flag. When
 * reduced motion is preferred, the element is flagged visible immediately (no
 * observer) so content is never trapped off-screen.
 */
function useReveal<T extends HTMLElement>(options?: { once?: boolean; rootMargin?: string }) {
  const once = options?.once ?? true;
  const rootMargin = options?.rootMargin ?? "0px 0px -10% 0px";
  const ref = useRef<T>(null);
  const [intersected, setIntersected] = useState(false);
  const reduce = usePrefersReducedMotion();
  const visible = reduce || intersected;

  useEffect(() => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIntersected(true);
            if (once) io.disconnect();
          } else if (!once) {
            setIntersected(false);
          }
        }
      },
      { rootMargin, threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, rootMargin, reduce]);

  return { ref, visible };
}

/** Wrapper that fades+lifts its children into view on scroll. */
function FolioReveal({
  children,
  className,
  delay = 0,
  style,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  style?: CSSProperties;
  as?: "div" | "section" | "aside" | "li" | "figure";
}) {
  const { ref, visible } = useReveal<HTMLElement>();
  return (
    <Tag
      // Polymorphic tag — ref type depends on Tag, cast broadly.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as React.Ref<any>}
      className={cn("folio-reveal", visible && "is-visible", className)}
      style={{ ...(delay ? { transitionDelay: `${delay}ms` } : null), ...style }}
    >
      {children}
    </Tag>
  );
}

/* ------------------------------------------------------------------ */
/*  CountUp — animate numeric marginalia from 0 → final                 */
/* ------------------------------------------------------------------ */

/** Parse "100%", "2024", "1,200", "3.5M" into {num, suffix, prefix}. */
function parseNumeric(value: string): { num: number; suffix: string; prefix: string; animatable: boolean } | null {
  const m = value.match(/^([^\d-]*?)(-?[\d][\d,.\s]*)(.*)$/);
  if (!m) return null;
  const prefix = m[1].trim();
  const raw = m[2].replace(/[\s,]/g, "");
  const suffix = m[3].trim();
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  // Skip huge/infinite-feeling values (years far in the future are fine but
  // "—" or non-numeric strings already returned null).
  if (Math.abs(num) > 1_000_000) return null;
  return { num, suffix, prefix, animatable: true };
}

function CountUp({ value, className }: { value: string; className?: string }) {
  const parsed = parseNumeric(value);
  const reduce = usePrefersReducedMotion();
  const [display, setDisplay] = useState(parsed && !reduce ? "0" : value);

  useEffect(() => {
    if (!parsed || reduce) return;
    let raf = 0;
    const start = performance.now();
    const duration = 900;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out quint
      const eased = 1 - Math.pow(1 - t, 5);
      const current = parsed.num * eased;
      const rounded = Math.abs(parsed.num) >= 100 ? Math.round(current) : Math.round(current * 10) / 10;
      setDisplay(`${parsed.prefix}${rounded.toLocaleString("en-US")}${parsed.suffix}`);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [parsed, reduce, value]);

  return <span className={className}>{display}</span>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Strip HTML tags server-safe (regex). Used for the editorial lede so the
 *  drop-cap CSS can target the first character cleanly. */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

type FilterKind = "department" | "location" | "type";

function facet(jobs: Job[], pick: (j: Job) => string | null): string[] {
  const set = new Set<string>();
  jobs.forEach((j) => {
    const v = pick(j);
    if (v) set.add(v);
  });
  return Array.from(set).sort();
}

const FILTER_LABEL: Record<FilterKind, string> = {
  department: "Department",
  location: "Location",
  type: "Type",
};

/* ------------------------------------------------------------------ */
/*  Pull quote                                                          */
/* ------------------------------------------------------------------ */

function PullQuote({ t, accent }: { t: CareerTestimonial; accent: string }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <figure
      ref={ref}
      className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-28"
    >
      <span
        className={cn("folio-quote-mark block font-fraunces-display text-7xl leading-none sm:text-8xl", visible && "is-visible")}
        style={{ color: accent }}
        aria-hidden
      >
        &ldquo;
      </span>
      <blockquote className="mt-4 font-fraunces text-2xl italic leading-[1.35] text-folio-ink sm:text-3xl sm:leading-[1.32]">
        {t.quote}
      </blockquote>
      <figcaption className="mt-7 font-mono text-xs uppercase tracking-[0.18em] text-folio-ink/60">
        {t.name}
        {t.role ? <span className="text-folio-ink/40"> · {t.role}</span> : null}
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/*  Roles — filter pills + editorial rows                               */
/* ------------------------------------------------------------------ */

function RolesList({ jobs, boardRoot, accent }: { jobs: Job[]; boardRoot: string; accent: string }) {
  const [sel, setSel] = useState<Record<FilterKind, Set<string>>>({
    department: new Set(),
    location: new Set(),
    type: new Set(),
  });

  const departments = useMemo(() => facet(jobs, (j) => j.department), [jobs]);
  const locations = useMemo(
    () => facet(jobs, (j) => j.location ?? formatWorkplaceType(j.workplaceType)),
    [jobs],
  );
  const types = useMemo(
    () => facet(jobs, (j) => formatEmploymentType(j.employmentType)),
    [jobs],
  );

  const facetGroups: { key: FilterKind; values: string[] }[] = (
    [
      { key: "department" as const, values: departments },
      { key: "location" as const, values: locations },
      { key: "type" as const, values: types },
    ] as { key: FilterKind; values: string[] }[]
  ).filter((g) => g.values.length > 0);

  function toggle(key: FilterKind, value: string) {
    setSel((prev) => {
      const next = new Set(prev[key]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...prev, [key]: next };
    });
  }

  const shown = useMemo(() => {
    return jobs.filter((j) => {
      if (sel.department.size && !(j.department && sel.department.has(j.department))) return false;
      if (sel.location.size) {
        const loc = j.location ?? formatWorkplaceType(j.workplaceType);
        if (!sel.location.has(loc)) return false;
      }
      if (sel.type.size) {
        const t = formatEmploymentType(j.employmentType);
        if (!sel.type.has(t)) return false;
      }
      return true;
    });
  }, [jobs, sel]);

  const groups = useMemo(() => {
    const map = new Map<string, Job[]>();
    shown.forEach((j) => {
      const key = j.department ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(j);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown]);

  return (
    <div>
      {/* Filter pills — sharp, mono, editorial */}
      {facetGroups.map((g) => (
        <div key={g.key} className="mb-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.18em] text-folio-ink/45">
            {FILTER_LABEL[g.key]}
          </span>
          {g.values.map((value) => {
            const on = sel[g.key].has(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggle(g.key, value)}
                aria-pressed={on}
                className={cn(
                  "border px-3 py-1 font-mono text-xs uppercase tracking-[0.12em] transition-colors duration-150",
                  on
                    ? "border-folio-ink bg-folio-ink text-folio-paper"
                    : "border-folio-ink/25 text-folio-ink/70 hover:border-folio-ink/60 hover:text-folio-ink",
                )}
              >
                {value}
              </button>
            );
          })}
        </div>
      ))}

      {shown.length === 0 ? (
        <p className="py-16 text-center font-fraunces text-base italic text-folio-ink/50">
          No roles match these filters.
        </p>
      ) : (
        <div className="divide-y divide-folio-ink/12 border-t border-folio-ink/12">
          {groups.map(([dept, deptJobs]) => (
            <div key={dept}>
              {groups.length > 1 && (
                <p className="py-4 font-mono text-[10px] uppercase tracking-[0.2em] text-folio-ink/45">
                  {dept} · {deptJobs.length}
                </p>
              )}
              {deptJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`${boardRoot}/jobs/${job.slug}` as Route}
                  className="group grid grid-cols-1 items-baseline gap-1.5 py-5 transition-colors duration-150 hover:bg-folio-ink/[0.025] sm:grid-cols-[1fr_auto_auto] sm:gap-6"
                >
                  <span className="font-fraunces text-xl tracking-tight text-folio-ink folio-row-underline sm:text-2xl">
                    {job.title}
                  </span>
                  <span className="font-mono text-xs uppercase tracking-[0.14em] text-folio-ink/60">
                    {job.location ?? formatWorkplaceType(job.workplaceType)}
                  </span>
                  <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.14em] text-folio-ink/60">
                    {formatEmploymentType(job.employmentType)}
                    <EditorialArrow
                      className="size-3.5 -translate-x-1.5 opacity-0 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0 group-hover:opacity-100"
                      style={{ color: accent }}
                    />
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FAQ — dialogue Q./A.                                                */
/* ------------------------------------------------------------------ */

function FolioFaq({ items, accent }: { items: CareerPageConfig["faq"]["items"]; accent: string }) {
  const [open, setOpen] = useState<number | null>(0);
  if (items.length === 0) return null;

  return (
    <div className="divide-y divide-folio-ink/12 border-t border-folio-ink/12">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={i}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="group grid w-full grid-cols-[2rem_1fr] gap-4 py-6 text-left transition-colors duration-150 hover:bg-folio-ink/[0.025]"
            >
              <span
                className="font-fraunces text-lg italic"
                style={{ color: accent }}
                aria-hidden
              >
                Q.
              </span>
              <span className="font-fraunces text-lg leading-snug tracking-tight text-folio-ink sm:text-xl">
                {item.q}
              </span>
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <div className="grid grid-cols-[2rem_1fr] gap-4 pb-6">
                  <span
                    className="font-fraunces text-lg italic text-folio-ink/40"
                    aria-hidden
                  >
                    A.
                  </span>
                  <p className="max-w-2xl font-fraunces text-base leading-relaxed text-folio-ink/80">
                    {item.a}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FolioTemplate                                                       */
/* ------------------------------------------------------------------ */

export function FolioTemplate({
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
  const ctaColor = config.cta.color ?? accent;
  const overlayFrom = config.hero.overlayFrom ?? `${accent}99`;
  const overlayTo = config.hero.overlayTo ?? `${accent}00`;
  const headline = config.hero.headline || "We're building the place people actually want to work.";
  const heroImage = config.hero.imageUrl ?? workspace.heroImageUrl;
  const logo = workspace.logoUrl;
  const ed = config.editorial;

  const lede = stripTags(config.intro.body);
  // Section ordinals are incremental across whichever sections are present,
  // so "Open roles" is 03 only when both The brief + What we believe render.
  const hasBrief = Boolean(lede);
  const hasValues = config.values.enabled && config.values.items.length > 0;
  const briefN = 1;
  const valuesN = hasBrief ? 2 : 1;
  const rolesN = (hasBrief ? 1 : 0) + (hasValues ? 1 : 0) + 1;
  const faqN = rolesN + 1;
  const sectionNum = (n: number) => (ed.numberedSections ? <SectionMark n={n} /> : null);

  // Pull-quote candidate: first testimonial if enabled.
  const pullQuote = ed.pullQuoteEnabled && config.testimonials.enabled && config.testimonials.items.length > 0
    ? config.testimonials.items[0]
    : null;
  const moreVoices = config.testimonials.enabled && config.testimonials.items.length > 1
    ? config.testimonials.items.slice(1)
    : [];

  return (
    <div
      className="font-fraunces text-folio-ink"
      style={{ ["--folio-ink" as string]: "#1a1715", ["--folio-paper" as string]: config.theme.background }}
    >
      {/* ── Masthead bar ─────────────────────────────────────────────── */}
      <header className="border-b border-folio-ink/15">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-folio-ink/70">
            {ed.mastKicker}
          </span>
          {ed.issueLabel && (
            <span className="hidden font-mono text-[11px] uppercase tracking-[0.22em] text-folio-ink/55 sm:block">
              {ed.issueLabel}
            </span>
          )}
          <Link
            href={(boardRoot || "/") as Route}
            className="flex items-center gap-2"
            aria-label={workspace.name}
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={workspace.name} className="h-7 w-auto object-contain" />
            ) : (
              <span className="font-fraunces-display text-lg tracking-tight text-folio-ink">
                {workspace.name}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative min-h-[58vh] overflow-hidden">
        <div
          className="folio-hero absolute inset-0"
          style={
            heroImage
              ? {
                  backgroundImage: `url(${heroImage})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : { backgroundColor: accent }
          }
        />
        {heroImage && (
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(180deg, ${overlayFrom} 0%, ${overlayTo} 100%)` }}
          />
        )}
        <div className="relative mx-auto flex min-h-[58vh] max-w-6xl flex-col justify-end px-6 pb-14 pt-20 sm:pb-20">
          {config.hero.subhead && (
            <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.22em] text-folio-paper/75">
              {config.hero.subhead}
            </p>
          )}
          <h1 className="folio-mask max-w-4xl font-fraunces-display text-4xl leading-[1.02] tracking-tight text-folio-paper drop-shadow-[0_2px_12px_rgba(0,0,0,0.25)] sm:text-6xl sm:leading-[1.0]">
            <span>{headline}</span>
          </h1>
          <div className="mt-8 flex items-center gap-4">
            <a
              href="#positions"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("positions")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="group inline-flex items-center gap-2 border-b border-folio-paper/60 pb-1 font-mono text-xs uppercase tracking-[0.18em] text-folio-paper transition-colors duration-150 hover:border-folio-paper"
            >
              {config.hero.ctaButtonText || "Read the roles"}
              <EditorialArrow className="size-3.5 transition-transform duration-200 group-hover:translate-x-1" />
            </a>
          </div>
        </div>
      </section>

      {/* ── 01 — The brief ───────────────────────────────────────────── */}
      {lede && (
        <section className="mx-auto max-w-6xl px-6 pt-20 sm:pt-28">
          <FolioReveal className="flex items-baseline gap-4 border-b border-folio-ink/15 pb-5">
            {sectionNum(briefN)}
            <h2 className="font-fraunces text-2xl italic tracking-tight text-folio-ink/55 sm:text-3xl">
              The brief
            </h2>
          </FolioReveal>

          <div className="grid gap-10 pt-10 sm:grid-cols-[1fr_240px] sm:gap-16">
            <FolioReveal>
              <p
                className={cn(
                  "font-fraunces text-xl leading-[1.55] text-folio-ink sm:text-2xl sm:leading-[1.5]",
                  ed.dropCap && "folio-dropcap",
                )}
              >
                {lede}
              </p>
              {ed.byline && (
                <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-folio-ink/50">
                  {ed.byline}
                </p>
              )}
            </FolioReveal>

            {/* Marginalia — re-present overview.stats */}
            {config.overview.enabled && config.overview.stats.length > 0 && (
              <FolioReveal as="aside" delay={80} className="border-l border-folio-ink/15 pl-5">
                <p className="mb-5 font-mono text-[10px] uppercase tracking-[0.2em] text-folio-ink/45">
                  {config.overview.title}
                </p>
                <dl className="space-y-5">
                  {config.overview.stats.map((stat) => (
                    <div key={stat.label} className="border-t border-folio-ink/12 pt-3 first:border-t-0 first:pt-0">
                      <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-folio-ink/55">
                        {stat.label}
                      </dt>
                      <dd className="mt-1 font-fraunces-display text-3xl tracking-tight text-folio-ink">
                        <CountUp value={stat.value || "—"} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </FolioReveal>
            )}
          </div>
        </section>
      )}

      {/* ── 02 — What we believe ─────────────────────────────────────── */}
      {config.values.enabled && config.values.items.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pt-24 sm:pt-32">
          <FolioReveal className="flex items-baseline gap-4 border-b border-folio-ink/15 pb-5">
            {sectionNum(valuesN)}
            <h2 className="font-fraunces text-2xl italic tracking-tight text-folio-ink/55 sm:text-3xl">
              {config.values.title}
            </h2>
          </FolioReveal>

          <div className="grid grid-cols-1 pt-10 sm:grid-cols-3">
            {config.values.items.map((value, i) => (
              <FolioReveal
                key={value.title}
                delay={i * 80}
                className="border-t border-folio-ink/15 py-7 sm:border-t-0 sm:border-l sm:py-0 sm:px-8 sm:first:border-l-0 sm:first:pl-0"
              >
                <span
                  className="block font-mono text-[11px] uppercase tracking-[0.2em]"
                  style={{ color: accent }}
                  aria-hidden
                >
                  {toRoman(i + 1)}
                </span>
                <h3 className="mt-3 font-fraunces-display text-2xl tracking-tight text-folio-ink">
                  {value.title}
                </h3>
                {value.body && (
                  <p className="mt-2 font-fraunces text-base leading-relaxed text-folio-ink/75">
                    {value.body}
                  </p>
                )}
              </FolioReveal>
            ))}
          </div>
        </section>
      )}

      {/* ── Pull quote ───────────────────────────────────────────────── */}
      {pullQuote && (
        <section className="pt-12 sm:pt-16">
          <Fleuron className="mx-auto block size-16 text-folio-ink/30" />
          <PullQuote t={pullQuote} accent={accent} />
        </section>
      )}

      {/* ── More voices — secondary testimonials, editorial grid ─────── */}
      {moreVoices.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pt-8 sm:pt-12">
          <div className="grid gap-10 sm:grid-cols-2 sm:gap-14">
            {moreVoices.map((t, i) => (
              <FolioReveal
                key={i}
                as="figure"
                delay={i * 80}
                className="border-l-2 pl-5"
                style={{ borderColor: accent }}
              >
                <span className="font-fraunces text-3xl italic leading-none" style={{ color: accent }} aria-hidden>
                  &ldquo;
                </span>
                <blockquote className="mt-2 font-fraunces text-lg italic leading-[1.45] text-folio-ink/85">
                  {t.quote}
                </blockquote>
                <figcaption className="mt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-folio-ink/55">
                  {t.name}
                  {t.role ? <span className="text-folio-ink/35"> · {t.role}</span> : null}
                </figcaption>
              </FolioReveal>
            ))}
          </div>
        </section>
      )}

      {/* ── 03 — Open roles ──────────────────────────────────────────── */}
      <section id="positions" className="mx-auto max-w-6xl scroll-mt-8 px-6 pt-24 sm:pt-32">
        <FolioReveal className="flex items-baseline gap-4 border-b border-folio-ink/15 pb-5">
          {sectionNum(rolesN)}
          <h2 className="font-fraunces text-2xl italic tracking-tight text-folio-ink/55 sm:text-3xl">
            {config.positions.title}
          </h2>
        </FolioReveal>

        {jobs.length === 0 ? (
          <p className="py-16 text-center font-fraunces text-base italic text-folio-ink/50">
            No open positions right now.
          </p>
        ) : (
          <FolioReveal className="pt-10">
            <RolesList jobs={jobs} boardRoot={boardRoot} accent={accent} />
          </FolioReveal>
        )}
      </section>

      {/* ── 04 — Questions ───────────────────────────────────────────── */}
      {config.faq.enabled && config.faq.items.length > 0 && (
        <section className="mx-auto max-w-3xl px-6 pt-24 sm:pt-32">
          <FolioReveal className="flex items-baseline gap-4 border-b border-folio-ink/15 pb-5">
            {sectionNum(faqN)}
            <h2 className="font-fraunces text-2xl italic tracking-tight text-folio-ink/55 sm:text-3xl">
              {config.faq.title}
            </h2>
          </FolioReveal>
          <FolioReveal className="pt-6">
            <FolioFaq items={config.faq.items} accent={accent} />
          </FolioReveal>
        </section>
      )}

      {/* ── Coda (CTA) ───────────────────────────────────────────────── */}
      {config.cta.enabled && config.cta.title && (
        <section className="mx-auto max-w-4xl px-6 pt-24 text-center sm:pt-32">
          <Asterism className="mx-auto block size-12 text-folio-ink/35" />
          <FolioReveal className="pt-6">
            <h2 className="font-fraunces-display text-4xl tracking-tight text-folio-ink sm:text-5xl">
              {config.cta.title}
            </h2>
            {config.cta.body && (
              <p className="mx-auto mt-5 max-w-2xl font-fraunces text-lg leading-relaxed text-folio-ink/75">
                {config.cta.body}
              </p>
            )}
            {workspace.websiteUrl && (
              <a
                href={workspace.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group mt-8 inline-flex items-center gap-2 border-b-2 pb-1 font-mono text-xs uppercase tracking-[0.18em] transition-colors duration-150"
                style={{ color: ctaColor, borderColor: `${ctaColor}55` }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = ctaColor)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = `${ctaColor}55`)}
              >
                {config.cta.buttonText || "Get in touch"}
                <EditorialArrow className="size-3.5 transition-transform duration-200 group-hover:translate-x-1" />
              </a>
            )}
          </FolioReveal>
        </section>
      )}

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="mt-24 border-t border-folio-ink/15 sm:mt-32">
        <div className="py-10">
          <CareerFooter
            config={config}
            workspaceName={workspace.name}
            maxWidth="max-w-6xl"
            iconRounded="rounded-none"
          />
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Roman numerals for value cards                                      */
/* ------------------------------------------------------------------ */

function toRoman(n: number): string {
  const map: [number, string][] = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let out = "";
  let remaining = n;
  for (const [val, sym] of map) {
    while (remaining >= val) {
      out += sym;
      remaining -= val;
    }
  }
  return out || "I";
}
