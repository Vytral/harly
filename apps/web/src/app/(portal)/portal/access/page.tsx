import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AccessCodeForm } from "@/features/portal/PortalCodeForms";
import { getSinglePortalWorkspace } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pages.portalAccess.page");
  return {
    title: t("title"),
    // Keep one-time codes out of referrers and search indexes.
    referrer: "no-referrer",
    robots: { index: false, follow: false },
  };
}

export default async function PortalCodePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const t = await getTranslations("pages.portalAccess.page");
  const params = await searchParams;
  const code = Array.isArray(params.code) ? (params.code[0] ?? "") : (params.code ?? "");
  const workspace = await getSinglePortalWorkspace();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {workspace ? (
          <AccessCodeForm initialCode={code} />
        ) : (
          <p role="alert" className="text-sm text-muted-foreground">
            {t("unavailable")}
          </p>
        )}
      </div>
    </main>
  );
}
