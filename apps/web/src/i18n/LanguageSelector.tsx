"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { setLocale } from "./actions";
import { locales } from "./config";

const names: Record<string, string> = {
  en: "English", es: "Español", "pt-BR": "Português (Brasil)", de: "Deutsch", fr: "Français", "nl-NL": "Nederlands",
};

export function LanguageSelector({ variant = "card" }: { variant?: "card" | "compact" }) {
  return variant === "compact" ? <CompactLanguageSelector /> : <LanguageCard />;
}

/** Header control on auth and onboarding screens: applies the language as soon as it changes. */
function CompactLanguageSelector() {
  const t = useTranslations("language");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  return (
    <section lang={locale} className="inline-flex flex-col items-start">
      <label htmlFor="harly-language-compact" className="sr-only">{t("label")}</label>
      <select id="harly-language-compact" value={locale} disabled={pending} className="rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-soft-ink hover:border-border focus-visible:ring-2 focus-visible:ring-ring" onChange={(event) => {
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

/** Account page card: same structure as the email language card, with an explicit save. */
function LanguageCard() {
  const t = useTranslations("language");
  const locale = useLocale();
  const router = useRouter();
  const [value, setValue] = useState<string>(locale);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function save() {
    setError(false);
    startTransition(async () => {
      try { await setLocale(value); router.refresh(); } catch { setError(true); }
    });
  }

  return (
    <Card lang={locale} className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b bg-muted/20 px-6 pt-4 pb-3.5">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-6 py-5">
        <label htmlFor="harly-language" className="block text-sm font-medium">{t("label")}</label>
        <div className="flex flex-wrap items-center gap-3">
          <select
            id="harly-language"
            value={value}
            disabled={pending}
            onChange={(event) => { setValue(event.target.value); setError(false); }}
            className="min-h-10 min-w-56 rounded-md border bg-background px-3 py-2 text-sm"
          >
            {locales.map((item) => <option key={item} value={item} lang={item}>{names[item]}</option>)}
          </select>
          <Button type="button" onClick={save} disabled={pending || value === locale}>
            {pending ? t("saving") : t("save")}
          </Button>
        </div>
        {error && <p role="alert" className="text-sm text-danger-rust">{t("error")}</p>}
      </CardContent>
    </Card>
  );
}
