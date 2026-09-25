import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { isDemoMode } from "@harly/config";

import { DemoEnterForm } from "./_components/demo-enter-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Enter the demo",
  robots: { index: false, follow: false },
};

export default async function EnterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isDemoMode()) {
    notFound();
  }

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const { error } = await searchParams;
  const captchaFailed = error === "captcha";

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-8 py-6">
        {/* Wordmark reappears here on mobile, where the brand panel is
            hidden by the split-screen layout. */}
        <Image
          src="/harly-full-black.svg"
          alt="Harly"
          width={96}
          height={24}
          className="h-6 w-auto md:hidden"
          priority
        />
        <Link
          href="/"
          className="ml-auto text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          Back to careers
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm text-center">
          <h1 className="font-display text-3xl tracking-tight text-foreground">
            Enter the demo
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Explore a hiring workspace that&apos;s ready to click around in.
            Change jobs, move candidates, try the tools — nothing here is
            permanent.
          </p>

          {captchaFailed ? (
            <p
              role="alert"
              className="mt-6 rounded-lg border border-danger-rust/25 bg-danger-rust/[0.06] px-3.5 py-2.5 text-left text-sm text-danger-rust"
            >
              That verification didn&apos;t go through. Please try again.
            </p>
          ) : null}

          <div className="mt-8">
            <DemoEnterForm siteKey={siteKey} />
          </div>
        </div>
      </main>
    </div>
  );
}
