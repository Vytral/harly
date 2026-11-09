"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocale } from "./actions";
import { locales } from "./config";

const names: Record<string, string> = {
  en: "English", es: "Español", "pt-BR": "Português (Brasil)", de: "Deutsch", fr: "Français", "nl-NL": "Nederlands",
};

export function LanguageSelector({ variant = "card" }: { variant?: "card" | "compact" }) {
  const t = useTranslations("language");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  const compact = variant === "compact";
  return (
    <section lang={locale} className={compact ? "inline-flex flex-col items-start" : "rounded-xl border p-6"}>
      <label htmlFor={compact ? "harly-language-compact" : "harly-language"} className={compact ? "sr-only" : "block text-sm font-medium"}>{t("label")}</label>
      <select id={compact ? "harly-language-compact" : "harly-language"} value={locale} disabled={pending} className={compact ? "rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-soft-ink hover:border-border focus-visible:ring-2 focus-visible:ring-ring" : "mt-2 rounded-md border bg-background px-3 py-2 text-sm"} onChange={(event) => {
        const next = event.target.value;
        setError(false);
        startTransition(async () => {
          try { await setLocale(next); router.refresh(); } catch { setError(true); }
        });
      }}>
        {locales.map((item) => <option key={item} value={item} lang={item}>{names[item]}</option>)}
      </select>
      {error && <p role="alert" className="mt-1 text-xs text-danger-rust">{t("error")}</p>}
    </section>
  );
}
