"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { updatePortalEmailPreferenceAction } from "@/features/portal/profile-actions";

const emailLocales = [
  { tag: "en", name: "English" },
  { tag: "es", name: "Español" },
  { tag: "pt-BR", name: "Português (Brasil)" },
  { tag: "de", name: "Deutsch" },
  { tag: "fr", name: "Français" },
  { tag: "nl-NL", name: "Nederlands" },
] as const;

export function PortalEmailLanguagePreference({
  initialValue,
}: {
  initialValue: string | null;
}) {
  const t = useTranslations("candidateEmailPreference");
  const router = useRouter();
  const [value, setValue] = useState(initialValue ?? "");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const isDirty = value !== (initialValue ?? "");

  function save() {
    startTransition(async () => {
      const result = await updatePortalEmailPreferenceAction({
        preferredEmailLocale: value === "" ? null : value,
      });
      setNotice(result.ok ? t("saved") : t("failed"));
      if (result.ok) router.refresh();
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:border-zinc-800 dark:bg-zinc-900">
      <div className="max-w-xl space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {t("title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="candidate-email-language"
            className="block text-xs font-medium text-muted-foreground"
          >
            {t("label")}
          </label>
          <select
            id="candidate-email-language"
            className="h-10 w-full rounded-lg border border-border bg-card px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring sm:max-w-sm"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setNotice("");
            }}
            disabled={isPending}
          >
            <option value="">{t("noPreference")}</option>
            {emailLocales.map((item) => (
              <option key={item.tag} value={item.tag}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={isPending || !isDirty}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? t("saving") : t("save")}
          </button>
          <p
            className="text-xs text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {notice}
          </p>
        </div>
      </div>
    </section>
  );
}
