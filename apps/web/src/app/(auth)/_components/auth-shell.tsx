import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import type { AuthBranding } from "@/features/auth/branding.server";

/**
 * Shared chrome for the staff auth screens. A quiet top bar carries the
 * workspace brand lockup on the left (logo + name, falling back to the Harly
 * wordmark) and an optional secondary link on the right. The card content is
 * centered on warm paper and animates in.
 */
export function AuthShell({
  branding,
  rightSlot,
  children,
}: {
  branding: AuthBranding;
  rightSlot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center px-8 pb-6 pt-10">
        <div />
        <div className="flex justify-center">
          <AuthBrandLockup branding={branding} />
        </div>
        <div className="flex justify-end text-sm">{rightSlot}</div>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        {children}
      </main>
    </div>
  );
}

/**
 * Workspace logo + name, or the Harly wordmark when a deployment hasn't set a
 * logo. Links back to the app root.
 */
export function AuthBrandLockup({ branding }: { branding: AuthBranding }) {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={branding.name}
    >
      {branding.logoUrl ? (
        <>
          {/* Workspace-configured logo. Use a plain <img>: the logo is an
              arbitrary remote/stored URL not registered with next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.logoUrl}
            alt={branding.name}
            className="h-9 w-auto max-w-[200px] object-contain"
          />
        </>
      ) : (
        <Image
          src="/harly-full-black.svg"
          alt="Harly"
          width={120}
          height={30}
          className="h-[30px] w-auto"
          priority
        />
      )}
    </Link>
  );
}

/**
 * The centered auth card: pure-snow surface, soft float shadow, generous
 * radius, and the entrance animation. Title + subtitle stack above the slot.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="auth-card-enter w-full max-w-[460px]">
      <div className="rounded-2xl border border-hairline bg-pure-snow px-8 py-10 shadow-[0_8px_30px_rgba(23,23,23,0.06)] sm:px-10">
        <div className="text-center">
          <h1 className="font-display text-[26px] tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>

        <div className="mt-8">{children}</div>
      </div>

      {footer ? (
        <div className="mt-5 text-center text-sm text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
