import { Suspense } from "react";
import { asc, eq, sql } from "drizzle-orm";

import { db, jobs, organization, workspaceSettings } from "@harly/db";
import { PortalLoginForm } from "@/features/portal/PortalLoginForm";
import {
  getPortalGitHubCredentials,
  getPortalGoogleCredentials,
  getPortalLinkedInCredentials,
} from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

async function getOrgBranding() {
  const [row] = await db
    .select({
      name: organization.name,
      logo: organization.logo,
      tagline: workspaceSettings.tagline,
      primaryColor: workspaceSettings.primaryColor,
      heroImageUrl: workspaceSettings.heroImageUrl,
    })
    .from(organization)
    .leftJoin(
      workspaceSettings,
      eq(workspaceSettings.organizationId, organization.id),
    )
    .orderBy(asc(organization.createdAt))
    .limit(1);

  const deptRows = await db
    .selectDistinct({ department: jobs.department })
    .from(jobs)
    .where(eq(jobs.status, "open"))
    .orderBy(sql`${jobs.department} asc nulls last`)
    .limit(6);

  const departments = deptRows
    .map((r) => r.department)
    .filter(Boolean) as string[];

  return {
    ...(row ?? {
      name: "Careers Portal",
      logo: null,
      tagline: null,
      primaryColor: null,
      heroImageUrl: null,
    }),
    departments,
  };
}

export default async function PortalLoginPage() {
  const org = await getOrgBranding();
  const [googleCredentials, githubCredentials, linkedinCredentials] =
    await Promise.all([
      getPortalGoogleCredentials(),
      getPortalGitHubCredentials(),
      getPortalLinkedInCredentials(),
    ]);
  const hasGoogle = Boolean(googleCredentials);
  const hasGitHub = Boolean(githubCredentials);
  const hasLinkedIn = Boolean(linkedinCredentials);

  const accentColor = org.primaryColor ?? "#18181b";
  const departments =
    org.departments.length > 0
      ? org.departments
      : ["Engineering", "Design", "Product"];

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      {/* Left panel , branding hero */}
      <div className="relative flex min-h-[220px] flex-col items-center justify-center overflow-hidden px-10 py-16 lg:min-h-screen lg:w-[46%] lg:items-start">
        {/* Background: hero image or gradient */}
        {org.heroImageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- external URL from workspace */}
            <img
              src={org.heroImageUrl}
              alt={org.name}
              className="absolute inset-0 size-full object-cover"
            />
            <div className="absolute inset-0 bg-black/30" />
          </>
        ) : (
          <>
            <div
              className="absolute inset-0"
              style={{ backgroundColor: accentColor }}
            />
            {/* Subtle geometric pattern overlay */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.06]"
              style={{
                backgroundImage: `radial-gradient(circle at 25% 25%, white 1px, transparent 1px),
                  radial-gradient(circle at 75% 75%, white 1px, transparent 1px)`,
                backgroundSize: "48px 48px",
              }}
            />
            {/* Circle decorations */}
            <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-white/10 lg:-right-16 lg:size-96" />
            <div className="pointer-events-none absolute -bottom-20 -left-12 size-52 rounded-full bg-white/10" />
          </>
        )}

        <div className="relative z-10 flex flex-col items-center text-center lg:items-start lg:text-left">
          {org.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- external URL from workspace
            <img
              src={org.logo}
              alt={org.name}
              className="mb-6 size-14 rounded-2xl object-cover shadow-lg"
            />
          ) : (
            <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-white/20 text-2xl font-bold text-white shadow-lg backdrop-blur-sm">
              {org.name.charAt(0).toUpperCase()}
            </div>
          )}

          <h1 className="text-2xl font-bold tracking-tight text-white lg:text-3xl">
            {org.name}
          </h1>

          <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/70">
            {org.tagline ??
              "Sign in to track your applications and explore open opportunities."}
          </p>

          {/* Decorative role pills */}
          <div className="mt-8 hidden flex-wrap gap-2 lg:flex">
            {departments.map((label) => (
              <span
                key={label}
                className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel , login form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12 lg:px-16">
        <div className="w-full max-w-sm space-y-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Welcome back
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Sign in to your candidate portal
            </p>
          </div>

          <Suspense>
            <PortalLoginForm
              hasGoogle={hasGoogle}
              hasGitHub={hasGitHub}
              hasLinkedIn={hasLinkedIn}
            />
          </Suspense>

          <p className="text-center text-xs text-muted-foreground">
            Powered by{" "}
            <span className="font-medium text-foreground">Harly</span>
          </p>
        </div>
      </div>
    </div>
  );
}
