"use client";

import { openCookiePreferences } from "@/lib/cookie-consent";
import { cn } from "@/lib/utils";

export function CookiePreferencesButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openCookiePreferences}
      className={cn("transition-colors hover:text-zinc-700 dark:hover:text-zinc-300", className)}
    >
      Cookie preferences
    </button>
  );
}
