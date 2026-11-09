"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const tError = useTranslations("publicError");
  const t = useTranslations("pages.portalRoot.error");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-4 text-center">
      <AlertTriangle className="size-12 text-muted-foreground" />
      <div>
        <h1 className="text-lg font-semibold">{tError("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tError("description")}
        </p>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={reset}>
          {tError("retry")}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/portal/dashboard">
            {t("backToDashboard")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
