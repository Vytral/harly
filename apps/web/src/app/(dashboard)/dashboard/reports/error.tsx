"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export default function ReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("pages.dashboardReports.error");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 px-4 text-center"
    >
      <AlertTriangle className="size-10 text-muted-foreground" strokeWidth={1.6} />
      <div>
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{t("description")}</p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {t("reference", { digest: error.digest })}
          </p>
        ) : null}
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => reset()}>
          {t("tryAgain")}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/dashboard">{t("backToDashboard")}</Link>
        </Button>
      </div>
    </div>
  );
}
