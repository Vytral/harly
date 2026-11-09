import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";

export default async function PortalNotFound() {
  const t = await getTranslations("pages.portalRoot.notFound");

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 px-4 text-center">
      <FileQuestion className="size-12 text-muted-foreground" />
      <div>
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("description")}
        </p>
      </div>
      <Button asChild variant="ghost">
        <Link href="/portal/dashboard">
          {t("backToDashboard")}
        </Link>
      </Button>
    </div>
  );
}
