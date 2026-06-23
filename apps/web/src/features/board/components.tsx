import Link from "next/link";
import type { Route } from "next";

import {
  boardThemeStyle,
  type WorkspaceBoardBranding,
} from "@/features/workspaces/board";
import { formatEmploymentType, formatWorkplaceType } from "@/lib/format";

function boardPath(root: string, ...segments: string[]): string {
  const base = root === "/" ? "" : root;
  return `${base}/${segments.join("/")}`;
}

type WorkspaceLike = Pick<
  WorkspaceBoardBranding,
  | "name"
  | "slug"
  | "logoUrl"
  | "tagline"
  | "description"
  | "websiteUrl"
  | "primaryColor"
  | "heroImageUrl"
  | "boardStyle"
  | "logoStyle"
>;

type WorkspaceLogoProps = {
  workspace: Pick<WorkspaceLike, "name" | "logoUrl" | "logoStyle">;
  size?: "sm" | "md" | "lg";
};

export function WorkspaceLogo({ workspace, size = "md" }: WorkspaceLogoProps) {
  const initials = workspace.name.slice(0, 2).toUpperCase();

  const sizeMap = {
    sm: { outer: "h-8 w-8", inner: "h-7 w-7", img: "h-8 w-8", text: "text-xs" },
    md: { outer: "h-12 w-12", inner: "h-10 w-10", img: "h-12 w-12", text: "text-sm" },
    lg: { outer: "h-16 w-16", inner: "h-12 w-12", img: "h-16 w-16", text: "text-lg" },
  };
  const s = sizeMap[size];

  if (workspace.logoStyle === "full" && workspace.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={workspace.logoUrl}
        alt={workspace.name}
        className={`${s.img} object-contain`}
      />
    );
  }

  return (
    <div className={`flex ${s.outer} items-center justify-center rounded-xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.25)]`}>
      {workspace.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={workspace.logoUrl}
          alt={workspace.name}
          className={`${s.inner} rounded-lg object-cover`}
        />
      ) : (
        <span className={`font-mono ${s.text} font-semibold text-zinc-900`}>
          {initials}
        </span>
      )}
    </div>
  );
}

type BoardShellProps = {
  workspace: WorkspaceLike;
  boardRoot?: string;
  children: React.ReactNode;
};

export function BoardShell({ workspace, boardRoot, children }: BoardShellProps) {
  const root = boardRoot ?? `/board/${workspace.slug}`;
  return (
    <div
      className="light board-canvas min-h-screen"
      style={{ colorScheme: "light", ...boardThemeStyle({ primaryColor: workspace.primaryColor }) }}
    >
      {children}
      <BoardFooter workspace={workspace} boardRoot={root} />
    </div>
  );
}

type BoardHeroProps = {
  workspace: WorkspaceLike;
  showCta?: boolean;
};

export function BoardHero({ workspace, showCta = false }: BoardHeroProps) {
  const hasHeroImage = Boolean(workspace.heroImageUrl);

  const backgroundStyle: React.CSSProperties = hasHeroImage
    ? {
        backgroundImage: `linear-gradient(180deg, rgba(9, 9, 11, 0.55) 0%, rgba(9, 9, 11, 0.4) 50%, rgba(9, 9, 11, 0.7) 100%), url(${workspace.heroImageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background:
          "linear-gradient(180deg, #1c1c1f 0%, #0a0a0a 100%)",
      };

  return (
    <section className="relative overflow-hidden" style={backgroundStyle}>
      <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-20 text-center sm:py-24">
        <WorkspaceLogo workspace={workspace} size="md" />
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Careers at {workspace.name}
        </h1>
        {workspace.tagline ? (
          <p className="mt-3 max-w-xl text-balance text-base leading-relaxed text-zinc-300">
            {workspace.tagline}
          </p>
        ) : null}
        {showCta ? (
          <a
            href="#open-roles"
            className="mt-8 inline-flex h-10 items-center rounded-md bg-white px-5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100"
          >
            View open roles
          </a>
        ) : null}
      </div>
    </section>
  );
}

export function BoardMinimalHeader({ workspace, portalEnabled }: { workspace: WorkspaceLike; portalEnabled?: boolean }) {
  return (
    <section className="border-b border-zinc-100 bg-white">
      <div className="relative mx-auto flex max-w-3xl flex-col items-center px-6 py-16 text-center">
        {portalEnabled ? (
          <Link
            href={"/portal" as Route}
            aria-label="Candidate portal"
            className="absolute right-6 top-4 flex size-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="size-5">
              <circle cx="12" cy="8" r="3.5" />
              <path d="M4.5 20.5c0-4.14 3.36-7.5 7.5-7.5s7.5 3.36 7.5 7.5" />
            </svg>
          </Link>
        ) : null}
        <WorkspaceLogo workspace={workspace} size="lg" />
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-zinc-900">
          Careers at {workspace.name}
        </h1>
        {workspace.tagline ? (
          <p className="mt-2 max-w-xl text-balance text-sm leading-relaxed text-zinc-500">
            {workspace.tagline}
          </p>
        ) : null}
      </div>
    </section>
  );
}

type JobRow = {
  id: string;
  slug: string;
  title: string;
  department: string | null;
  location: string | null;
  employmentType: string;
  workplaceType: string;
};

type JobTableProps = {
  boardRoot: string;
  jobs: JobRow[];
  style: "hero" | "minimal";
  showHeaderRow?: boolean;
};

export function JobTable({
  boardRoot,
  jobs,
  style,
  showHeaderRow = true,
}: JobTableProps) {
  if (jobs.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-sm text-zinc-500">
          No open positions right now. Check back soon.
        </p>
      </div>
    );
  }

  const isHero = style === "hero";

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <div className="flex items-baseline justify-between border-b border-zinc-100 pb-4">
        <h2 className="text-sm font-medium uppercase tracking-[0.08em] text-zinc-500">
          Job openings
        </h2>
        <span className="text-xs text-zinc-400">
          {jobs.length} open position{jobs.length === 1 ? "" : "s"}
        </span>
      </div>

      {isHero && showHeaderRow ? (
        <div className="mt-4 hidden grid-cols-[1fr_120px_140px_120px] gap-4 px-2 text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-400 sm:grid">
          <span>Position</span>
          <span>Work type</span>
          <span>Location</span>
          <span>Contract</span>
        </div>
      ) : null}

      <ul className="divide-y divide-zinc-100">
        {jobs.map((job) => (
          <li key={job.id}>
            <Link
              href={boardPath(boardRoot, "jobs", job.slug) as Route}
              className="group grid grid-cols-1 gap-2 px-2 py-5 transition hover:bg-zinc-50/60 sm:grid-cols-[1fr_120px_140px_120px] sm:items-center sm:gap-4"
            >
              <div>
                <p
                  className="text-base font-semibold transition group-hover:underline"
                  style={{ color: "var(--board-primary)" }}
                >
                  {job.title}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {job.department ?? "Open role"}
                </p>
              </div>
              <span className="text-sm text-zinc-700">
                {formatWorkplaceType(job.workplaceType)}
              </span>
              <span className="text-sm text-zinc-700">
                {job.location ?? "Remote"}
              </span>
              <span className="text-sm text-zinc-700">
                {formatEmploymentType(job.employmentType)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BoardFooter({
  workspace,
  boardRoot,
}: {
  workspace: WorkspaceLike;
  boardRoot: string;
}) {
  return (
    <footer className="border-t border-zinc-100 bg-white">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-6 py-8 text-xs text-zinc-500 sm:flex-row sm:justify-center sm:gap-6">
        {workspace.websiteUrl ? (
          <a
            href={workspace.websiteUrl}
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-zinc-900"
          >
            View website
          </a>
        ) : null}
        <Link
          href={boardRoot as Route}
          className="transition hover:text-zinc-900"
        >
          View all jobs
        </Link>
        <span className="text-zinc-400">
          Powered by{" "}
          <Link href={"/" as Route} className="font-medium text-zinc-700">
            Harly
          </Link>
        </span>
      </div>
    </footer>
  );
}

export function BoardTopBar({
  workspace,
  boardRoot,
  backHref,
  portalEnabled,
}: {
  workspace: WorkspaceLike;
  boardRoot: string;
  backHref?: Route;
  portalEnabled?: boolean;
}) {
  return (
    <header className="border-b border-zinc-100 bg-white">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
        <Link
          href={boardRoot as Route}
          className="flex items-center gap-2"
        >
          <WorkspaceLogo workspace={workspace} size="sm" />
          <span className="text-sm font-semibold text-zinc-900">
            {workspace.name}
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-3">
          {backHref ? (
            <Link
              href={backHref}
              className="text-sm text-zinc-500 transition hover:text-zinc-900"
            >
              View all jobs
            </Link>
          ) : null}
          {portalEnabled ? (
            <Link
              href={"/portal" as Route}
              aria-label="Candidate portal"
              className="flex size-8 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="size-5">
                <circle cx="12" cy="8" r="3.5" />
                <path d="M4.5 20.5c0-4.14 3.36-7.5 7.5-7.5s7.5 3.36 7.5 7.5" />
              </svg>
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}

type BoardJobHeaderProps = {
  workspace: WorkspaceLike;
  boardRoot: string;
  job: {
    slug: string;
    title: string;
    department: string | null;
    location: string | null;
    employmentType: string;
    workplaceType: string;
  };
  activeTab: "overview" | "application";
};

export function BoardJobHeader({
  workspace,
  boardRoot,
  job,
  activeTab,
}: BoardJobHeaderProps) {
  const overviewHref = boardPath(boardRoot, "jobs", job.slug);
  const applyHref = boardPath(boardRoot, "apply", job.slug);

  return (
    <div className="border-b border-zinc-100 bg-white">
      <div className="mx-auto max-w-3xl px-6 pb-0 pt-10 text-center">
        <div className="mx-auto mb-4 flex justify-center">
          <WorkspaceLogo workspace={workspace} size="md" />
        </div>
        <Link
          href={boardRoot as Route}
          className="text-sm font-semibold text-zinc-500 transition hover:text-zinc-900"
        >
          {workspace.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
          {job.title}
        </h1>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {job.location ? <MetaBadge>{job.location}</MetaBadge> : null}
          {job.department ? <MetaBadge>{job.department}</MetaBadge> : null}
          <MetaBadge>{formatWorkplaceType(job.workplaceType)}</MetaBadge>
          <MetaBadge>{formatEmploymentType(job.employmentType)}</MetaBadge>
        </div>
      </div>

      <nav className="mt-6 border-t border-zinc-100">
        <div className="mx-auto flex max-w-3xl justify-center gap-10 px-4 text-xs font-bold uppercase tracking-[0.1em]">
          <Link
            href={overviewHref as Route}
            className="border-b-2 py-4 transition"
            style={
              activeTab === "overview"
                ? { borderColor: "var(--board-primary)", color: "var(--board-primary)" }
                : { borderColor: "transparent", color: "#71717a" }
            }
          >
            Overview
          </Link>
          <Link
            href={applyHref as Route}
            className="border-b-2 py-4 transition"
            style={
              activeTab === "application"
                ? { borderColor: "var(--board-primary)", color: "var(--board-primary)" }
                : { borderColor: "transparent", color: "#71717a" }
            }
          >
            Application
          </Link>
        </div>
      </nav>
    </div>
  );
}

function MetaBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
      {children}
    </span>
  );
}
