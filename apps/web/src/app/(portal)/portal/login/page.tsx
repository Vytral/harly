import { Suspense } from "react";
import { asc } from "drizzle-orm";

import { db, organization } from "@harly/db";
import { PortalLoginForm } from "@/features/portal/PortalLoginForm";

export const dynamic = "force-dynamic";

async function getOrgName() {
  const [row] = await db
    .select({ name: organization.name, logo: organization.logo })
    .from(organization)
    .orderBy(asc(organization.createdAt))
    .limit(1);
  return row ?? { name: "Careers Portal", logo: null };
}

export default async function PortalLoginPage() {
  const org = await getOrgName();
  const hasGoogle = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const hasGitHub = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo / org name */}
        <div className="text-center">
          {org.logo ? (
            <img
              src={org.logo}
              alt={org.name}
              className="mx-auto mb-4 size-12 rounded-xl object-cover"
            />
          ) : (
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground text-lg font-bold">
              {org.name.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-xl font-semibold tracking-tight">{org.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to view your applications
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <Suspense>
            <PortalLoginForm hasGoogle={hasGoogle} hasGitHub={hasGitHub} />
          </Suspense>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Powered by{" "}
          <span className="font-medium text-foreground">Harly</span>
        </p>
      </div>
    </div>
  );
}
