"use client";

import { RouteError } from "@/components/ui/route-error";
import { useTranslations } from "next-intl";

export default function InboxError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("pages.dashboardInbox.error");
  return <RouteError error={error} reset={reset} title={t("title")} />;
}
