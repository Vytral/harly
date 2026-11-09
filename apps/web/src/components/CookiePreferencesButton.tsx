"use client";

import { useTranslations } from "next-intl";

import { openCookiePreferences } from "@/lib/cookie-consent";
import { cn } from "@/lib/utils";

export function CookiePreferencesButton({ className }: { className?: string }) {
  const t = useTranslations("ui.cookiePreferencesButton");
  return (
    <button
      type="button"
      onClick={openCookiePreferences}
      className={cn("transition-colors hover:text-zinc-700 dark:hover:text-zinc-300", className)}
    >
      {t("label")}
    </button>
  );
}
