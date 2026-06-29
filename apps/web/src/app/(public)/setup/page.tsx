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
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-8 py-6">
        <Link href="/" className="font-display text-lg tracking-tight text-pine">
          Harly
        </Link>
        <Link
          href="/login"
          className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          Sign in
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-primary">
            <span className="font-display text-lg font-bold text-primary-foreground">
              H
            </span>
          </div>

          <h1 className="font-display text-3xl tracking-tight text-foreground">
            Welcome to Harly
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            No workspace configured yet. Create an account to set up your hiring
            workspace and start publishing jobs.
          </p>

          <div className="mt-10 space-y-3">
            <Link
              href="/signup"
              className="block w-full rounded-lg bg-primary py-3.5 text-center text-sm font-semibold text-primary-foreground transition hover:bg-pine-strong"
            >
              Get started
            </Link>
            <Link
              href="/login"
              className="block w-full rounded-lg border border-input py-3.5 text-center text-sm font-medium text-foreground transition hover:border-ring hover:bg-muted"
            >
              Sign in
            </Link>
          </div>

          <p className="mt-10 text-xs text-muted-foreground">
            Harly — open-source applicant tracking system
          </p>
        </div>
      </main>
    </div>
  );
}
