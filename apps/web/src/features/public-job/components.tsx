import Link from "next/link";
import type { Route } from "next";

import { formatEmploymentType, formatWorkplaceType } from "@/lib/format";

export type PublicJobBrand = {
  name: string;
  logoUrl?: string | null;
  accentColor: string;
  websiteUrl?: string | null;
  boardHref: string;
};

export type PublicJobMeta = {
  slug: string;
  title: string;
  location: string | null;
  department: string | null;
  employmentType: string;
  workplaceType: string;
};

function accentThemeStyle(color: string): React.CSSProperties {
  const m = color.match(/^#([0-9a-fA-F]{6})$/);
  const soft = m
    ? `rgba(${parseInt(m[1].slice(0, 2), 16)}, ${parseInt(m[1].slice(2, 4), 16)}, ${parseInt(m[1].slice(4, 6), 16)}, 0.08)`
    : "#f4f4f5";
  return {
    "--board-primary": color,
    "--board-primary-foreground": "#ffffff",
    "--board-primary-soft": soft,
  } as React.CSSProperties;
}

export function PublicJobShell({
  brand,
  children,
}: {
  brand: PublicJobBrand;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-50" style={accentThemeStyle(brand.accentColor)}>
      {children}
      <PublicJobFooter brand={brand} />
    </div>
  );
}

export function PublicJobPageHeader({
  brand,
  job,
  activeTab,
}: {
  brand: PublicJobBrand;
  job: PublicJobMeta;
  activeTab: "overview" | "application";
}) {
  const accent = brand.accentColor;
  const overviewHref = `${brand.boardHref}/jobs/${job.slug}`;
  const applyHref = `${brand.boardHref}/apply/${job.slug}`;

  const activeLinkStyle = { borderColor: accent, color: accent };
  const inactiveLinkClass =
    "border-transparent text-zinc-500 transition hover:text-zinc-800";

  return (
    <header className="bg-white shadow-[0_1px_0_0_#e4e4e7]">
      <div className="mx-auto max-w-3xl px-4 py-10 text-center sm:px-6">
        {brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brand.logoUrl}
            alt={brand.name}
            className="mx-auto mb-5 h-14 w-14 rounded-2xl object-cover shadow-sm ring-1 ring-black/5"
          />
        ) : null}
        <Link
          href={brand.boardHref as Route}
          className="text-sm font-semibold text-zinc-500 transition hover:text-zinc-900"
        >
          {brand.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
          {job.title}
        </h1>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <MetaBadge>{job.location ?? "Remote"}</MetaBadge>
          {job.department ? <MetaBadge>{job.department}</MetaBadge> : null}
          <MetaBadge>{formatWorkplaceType(job.workplaceType)}</MetaBadge>
          <MetaBadge>{formatEmploymentType(job.employmentType)}</MetaBadge>
        </div>
      </div>

      <nav className="border-t border-zinc-100">
        <div className="mx-auto flex max-w-3xl justify-center gap-10 px-4 text-xs font-bold uppercase tracking-[0.1em]">
          <Link
            href={overviewHref as Route}
            className={`border-b-2 py-4 transition ${activeTab === "overview" ? "" : inactiveLinkClass}`}
            style={activeTab === "overview" ? activeLinkStyle : undefined}
          >
            Overview
          </Link>
          <Link
            href={applyHref as Route}
            className={`border-b-2 py-4 transition ${activeTab === "application" ? "" : inactiveLinkClass}`}
            style={activeTab === "application" ? activeLinkStyle : undefined}
          >
            Application
          </Link>
        </div>
      </nav>
    </header>
  );
}

function MetaBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
      {children}
    </span>
  );
}

export function PublicJobFooter({ brand }: { brand: PublicJobBrand }) {
  return (
    <footer className="border-t border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 py-8 sm:flex-row sm:justify-center sm:gap-8">
        {brand.websiteUrl ? (
          <a
            href={brand.websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-zinc-500 transition hover:text-zinc-900"
          >
            View website
          </a>
        ) : null}
        <Link
          href={brand.boardHref as Route}
          className="text-xs text-zinc-500 transition hover:text-zinc-900"
        >
          View all jobs
        </Link>
        <a
          href="mailto:help@openhire.io"
          className="text-xs text-zinc-500 transition hover:text-zinc-900"
        >
          Help
        </a>
        <span className="text-xs text-zinc-400">
          Powered by{" "}
          <Link
            href={"/" as Route}
            className="font-semibold text-zinc-600 transition hover:text-zinc-900"
          >
            OpenHire
          </Link>
        </span>
      </div>
    </footer>
  );
}
