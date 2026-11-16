import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { portalPrimaryButtonClass } from "@/features/portal/portal-form-ui";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pages.portalMagic.page");
  return {
    title: t("metadataTitle"),
    // Keep one-time tokens out of referrers and search indexes.
    referrer: "no-referrer",
    robots: { index: false, follow: false },
  };
}

/**
 * Confirmation step for emailed sign-in links. Opening the link only renders
 * this page; the one-time token is consumed by the POST below. Mail scanners
 * and link previewers that prefetch the URL therefore cannot burn it.
 */
export default async function PortalMagicLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const t = await getTranslations("pages.portalMagic.page");
  const params = await searchParams;
  const token = Array.isArray(params.token)
    ? (params.token[0] ?? "")
    : (params.token ?? "");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {token ? t("description") : t("missingToken")}
          </p>
        </div>
        {token ? (
          <form method="post" action="/api/portal/auth/magic">
            <input type="hidden" name="token" value={token} />
            <button type="submit" className={portalPrimaryButtonClass}>
              {t("confirm")}
            </button>
          </form>
        ) : (
          <a href="/portal/login" className="text-sm underline">
            {t("backToLogin")}
          </a>
        )}
      </div>
    </main>
  );
}
