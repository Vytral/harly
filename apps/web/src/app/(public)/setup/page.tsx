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
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900">
          <span className="font-mono text-sm font-bold text-white">OH</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Welcome to Harly
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-500">
          No workspace configured yet. Create an account to set up your hiring
          workspace and start publishing jobs.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/signup"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-200 px-6 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            Sign in
          </Link>
        </div>
        <p className="mt-8 text-xs text-zinc-400">
          Harly — open-source applicant tracking system
        </p>
      </div>
    </div>
  );
}
