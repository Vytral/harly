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

type BoardShellProps = {
  workspace: WorkspaceLike;
  boardRoot?: string;
  children: React.ReactNode;
};

export function BoardShell({ workspace, boardRoot, children }: BoardShellProps) {
  const root = boardRoot ?? `/board/${workspace.slug}`;
  return (
    <div
      className="board-canvas min-h-screen"
      style={boardThemeStyle({ primaryColor: workspace.primaryColor })}
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
  const initials = workspace.name.slice(0, 2).toUpperCase();
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
        {workspace.logoStyle === "full" && workspace.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={workspace.logoUrl}
            alt={workspace.name}
            className="h-14 w-14 object-contain"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.25)]">
            {workspace.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={workspace.logoUrl}
                alt={workspace.name}
                className="h-10 w-10 rounded-lg object-cover"
              />
            ) : (
              <span className="font-mono text-base font-semibold text-zinc-900">
                {initials}
              </span>
            )}
          </div>
        )}
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

export function BoardMinimalHeader({ workspace }: { workspace: WorkspaceLike }) {
  const initials = workspace.name.slice(0, 2).toUpperCase();

  return (
    <section className="border-b border-zinc-100 bg-white">
      <div className="mx-auto flex max-w-3xl flex-col items-center px-6 py-16 text-center">
        {workspace.logoStyle === "full" && workspace.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={workspace.logoUrl}
            alt={workspace.name}
            className="h-16 w-16 object-contain"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-50 ring-1 ring-zinc-100">
            {workspace.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={workspace.logoUrl}
                alt={workspace.name}
                className="h-12 w-12 rounded-xl object-cover"
              />
            ) : (
              <span
                className="font-mono text-lg font-semibold"
                style={{ color: "var(--board-primary)" }}
              >
                {initials}
              </span>
            )}
          </div>
        )}
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
}: {
  workspace: WorkspaceLike;
  boardRoot: string;
  backHref?: Route;
}) {
  const initials = workspace.name.slice(0, 2).toUpperCase();

  return (
    <header className="border-b border-zinc-100 bg-white">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
        <Link
          href={boardRoot as Route}
          className="flex items-center gap-2"
        >
          {workspace.logoStyle === "full" && workspace.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={workspace.logoUrl}
              alt={workspace.name}
              className="h-8 w-8 object-contain"
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-50 ring-1 ring-zinc-100">
              {workspace.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={workspace.logoUrl}
                  alt={workspace.name}
                  className="h-7 w-7 rounded object-cover"
                />
              ) : (
                <span className="font-mono text-xs font-semibold text-zinc-900">
                  {initials}
                </span>
              )}
            </span>
          )}
          <span className="text-sm font-semibold text-zinc-900">
            {workspace.name}
          </span>
        </Link>
        {backHref ? (
          <Link
            href={backHref}
            className="ml-auto text-sm text-zinc-500 transition hover:text-zinc-900"
          >
            View all jobs
          </Link>
        ) : null}
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
        {workspace.logoStyle === "full" && workspace.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={workspace.logoUrl}
            alt={workspace.name}
            className="mx-auto mb-4 h-12 w-12 object-contain"
          />
        ) : (
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 ring-1 ring-black/5 shadow-sm overflow-hidden">
            {workspace.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={workspace.logoUrl}
                alt={workspace.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span
                className="font-mono text-sm font-semibold"
                style={{ color: "var(--board-primary)" }}
              >
                {workspace.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
        )}
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
