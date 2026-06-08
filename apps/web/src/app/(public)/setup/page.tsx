import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";

import { db, organization } from "@harly/db";

export default async function SetupPage() {
  const [existing] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .orderBy(asc(organization.createdAt))
    .limit(1);

  if (existing) {
    redirect(`/board/${existing.slug}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
          <span className="font-display text-lg font-bold text-primary-foreground">H</span>
        </div>
        <h1 className="font-display text-2xl tracking-tight text-foreground">
          Welcome to Harly
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          No workspace configured yet. Create an account to set up your hiring
          workspace and start publishing jobs.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/signup"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:bg-pine-strong"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-border px-6 text-sm font-semibold text-foreground transition hover:border-ring hover:bg-muted"
          >
            Sign in
          </Link>
        </div>
        <p className="mt-8 text-xs text-muted-foreground">
          Harly — open-source applicant tracking system
        </p>
      </div>
    </div>
  );
}
