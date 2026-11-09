import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { and, eq, sql } from "drizzle-orm";

import { db, jobs, organization, workspaceSettings } from "@harly/db";
import { PortalLoginForm } from "@/features/portal/PortalLoginForm";
import { getSinglePortalWorkspace } from "@/lib/portal-auth";
import { getPortalAuthMethods } from "@/lib/portal-auth-methods";
import { getWorkspaceEmailSender } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getSinglePortalWorkspace();
  if (!workspace) return {};
  const t = await getTranslations("pages.portalLogin.page");
  const org = await getOrgBranding(workspace.id);
  return {
    title: t("metadataTitle", { orgName: org.name }),
    icons: {
      icon: org.logo ?? "/favicon.svg",
    },
  };
}

async function getOrgBranding(workspaceId: string) {
  const t = await getTranslations("pages.portalLogin.page");
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
    .where(eq(organization.id, workspaceId))
    .limit(1);

  const deptRows = await db
    .selectDistinct({ department: jobs.department })
    .from(jobs)
    .where(and(eq(jobs.workspaceId, workspaceId), eq(jobs.status, "open")))
    .orderBy(sql`${jobs.department} asc nulls last`)
    .limit(6);

  const departments = deptRows
    .map((r) => r.department)
    .filter(Boolean) as string[];

  return {
    ...(row ?? {
      name: t("fallbackOrgName"),
      logo: null,
      tagline: null,
      primaryColor: null,
      heroImageUrl: null,
    }),
    departments,
  };
}

export default async function PortalLoginPage() {
  const t = await getTranslations("pages.portalLogin.page");
  const workspace = await getSinglePortalWorkspace();

  if (!workspace) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="text-xl font-semibold">{t("unavailableTitle")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("unavailableBody")}
          </p>
        </div>
      </main>
    );
  }

  const org = await getOrgBranding(workspace.id);
  const [methods, sender] = await Promise.all([
    getPortalAuthMethods(workspace.id),
    getWorkspaceEmailSender(workspace.id).catch(() => null),
  ]);

  const accentColor = org.primaryColor ?? "#18181b";
  const departments =
    org.departments.length > 0
      ? org.departments
      : [
          t("fallbackDepartments.engineering"),
          t("fallbackDepartments.design"),
          t("fallbackDepartments.product"),
        ];

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
              t("fallbackTagline")}
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
              {t("welcomeBack")}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t("signInSubtitle")}
            </p>
          </div>

          <Suspense>
            <PortalLoginForm
              methods={{
                password: methods.password,
                magicLink: methods.magicLink,
                google: methods.oauth.google,
                github: methods.oauth.github,
                linkedin: methods.oauth.linkedin,
                passkey: methods.passkey,
                accessCode: methods.accessCode,
                emailReset: methods.password && Boolean(sender),
              }}
            />
          </Suspense>

          <p className="text-center text-xs text-muted-foreground">
            {t.rich("poweredBy", {
              b: (chunks) => (
                <span className="font-medium text-foreground">{chunks}</span>
              ),
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
