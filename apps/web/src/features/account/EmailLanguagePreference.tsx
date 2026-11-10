"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  supportedEmailLocales,
  type EmailLocale,
} from "@harly/config/email-locale";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DemoLockedNotice } from "@/features/demo/DemoLockedNotice";
import { updateOwnEmailPreferenceAction } from "@/features/people/actions";

export function EmailLanguagePreference({
  initialValue,
  demoLocked = false,
}: {
  initialValue: EmailLocale | null;
  demoLocked?: boolean;
}) {
  // The UI locale translates this control only. The selected value comes from the
  // saved email preference and stays unset when that preference is null.
  const t = useTranslations("emailPreference");
  const savedValue = initialValue ?? "";
  const [value, setValue] = useState(savedValue);
  const [saved, setSaved] = useState(savedValue);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function savePreference() {
    startTransition(async () => {
      try {
        await updateOwnEmailPreferenceAction({
          preferredEmailLocale: value === "" ? null : value,
        });
        setSaved(value);
        setNotice(t("saved"));
        router.refresh();
      } catch {
        setNotice(t("saveError"));
      }
    });
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b bg-muted/20 px-6 pt-4 pb-3.5">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-6 py-5">
        <label
          htmlFor="email-language-preference"
          className="block text-sm font-medium"
        >
          {t("label")}
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <select
            id="email-language-preference"
            value={value}
            disabled={demoLocked || pending}
            onChange={(event) => {
              setValue(event.target.value as EmailLocale | "");
              setNotice(null);
            }}
            className="min-h-10 min-w-56 rounded-md border bg-background px-3 py-2 text-sm"
          >
            <option value="">{t("noPreference")}</option>
            {supportedEmailLocales.map((locale) => (
              <option key={locale} value={locale} lang={locale}>
                {t(`locales.${locale}`)}
              </option>
            ))}
          </select>
          <Button
            type="button"
            onClick={savePreference}
            disabled={demoLocked || pending || value === saved}
          >
            {pending ? t("saving") : t("save")}
          </Button>
        </div>
        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
        {demoLocked ? (
          <DemoLockedNotice>{t("demoLocked")}</DemoLockedNotice>
        ) : null}
      </CardContent>
    </Card>
  );
}
