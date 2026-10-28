import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { isDemoMode } from "@harly/config";

import { DEMO_STYLES, parseDemoStyle } from "@/features/demo/sandbox-styles";

import { DemoEnterForm } from "./_components/demo-enter-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Open your sandbox",
  robots: { index: false, follow: false },
};

export default async function EnterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; style?: string }>;
}) {
  if (!isDemoMode()) {
    notFound();
  }

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const { error, style: rawStyle } = await searchParams;
  const captchaFailed = error === "captcha";
  const atCapacity = error === "capacity";
  const style = parseDemoStyle(rawStyle);
  const styleLabel = DEMO_STYLES.find((entry) => entry.key === style)?.label ?? "Playful";

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
          Back to previews
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm text-center">
          <h1 className="font-display text-3xl tracking-tight text-foreground">
            Open your sandbox
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You get a private copy of a hiring workspace, with a{" "}
            <span className="font-medium text-foreground">{styleLabel}</span>{" "}
            careers page. Change jobs, move candidates, restyle the careers page
            and try the tools. Nobody else sees your changes, and the sandbox is
            deleted after a few hours.
          </p>

          {captchaFailed ? (
            <p
              role="alert"
              className="mt-6 rounded-lg border border-danger-rust/25 bg-danger-rust/[0.06] px-3.5 py-2.5 text-left text-sm text-danger-rust"
            >
              That verification didn&apos;t go through. Please try again.
            </p>
          ) : null}

          {atCapacity ? (
            <p
              role="alert"
              className="mt-6 rounded-lg border border-danger-rust/25 bg-danger-rust/[0.06] px-3.5 py-2.5 text-left text-sm text-danger-rust"
            >
              The demo is full right now. Please try again in a few minutes.
            </p>
          ) : null}

          <div className="mt-8">
            <DemoEnterForm siteKey={siteKey} style={style} />
          </div>
        </div>
      </main>
    </div>
  );
}
