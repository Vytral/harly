import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";

import { db, organization } from "@harly/db";
import { getDeploymentBootstrapStatus } from "@harly/auth/setup";

import { SetupClaimForm } from "./SetupClaimForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const bootstrap = await getDeploymentBootstrapStatus();
  const [existing] = await db
    .select({ slug: organization.slug })
    .from(organization)
    .orderBy(asc(organization.createdAt))
    .limit(1);

  if (existing || bootstrap.completed) {
    redirect("/");
  }

  return (
    <div className="flex min-h-[100dvh] flex-col md:min-h-0 md:h-full">
      <header className="flex items-center px-6 py-6 sm:px-8">
        {/* Wordmark , mobile only; the brand panel carries it on desktop. */}
        <a href="https://harly.dev" aria-label="Harly , visit harly.dev">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/harly-full-black.svg"
            alt="Harly"
            className="h-8 w-auto md:hidden"
          />
        </a>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16 sm:px-8">
        <div className="w-full max-w-sm">
          <span className="inline-flex items-center gap-2 rounded-full bg-sage/60 px-3 py-1 text-xs font-semibold text-sage-ink">
            <span className="size-1.5 rounded-full bg-pine" />
            First-run setup
          </span>

          <h1 className="mt-5 font-display text-3xl tracking-tight text-foreground">
            Set up your Harly
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            When you ran{" "}
            <code className="rounded bg-kraft px-1.5 py-0.5 font-mono text-[0.8em] text-foreground">
              harly init
            </code>
            , it printed a one-time setup token. Paste it below to claim this
            deployment. It stays valid for 15 minutes.
          </p>

          <SetupClaimForm />
        </div>
      </main>
    </div>
  );
}
