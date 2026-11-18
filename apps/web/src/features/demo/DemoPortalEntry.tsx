"use client";

import { useTransition } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/notification-island/toast";

import { openDemoPortalAsSampleCandidateAction } from "./candidate-portal-actions";

/** Portal sign-in page, demo only: skip sign-in and explore as a sample candidate. */
export function DemoPortalEntry() {
  const t = useTranslations("features.demo.demoPortalEntry");
  const router = useRouter();
  const [pending, start] = useTransition();

  function open() {
    start(async () => {
      try {
        const result = await openDemoPortalAsSampleCandidateAction();
        if (result.ok) {
          // Full navigation so the portal layout reads the fresh session cookie.
          window.location.assign(result.url);
          return;
        }
        if (result.enterDemo) {
          router.push("/enter" as Route);
          return;
        }
        toast.error(result.error);
      } catch {
        toast.error(t("error"));
      }
    });
  }

  return (
    <section className="w-full rounded-2xl border border-dashed bg-muted/30 p-4 text-left">
      <p className="text-sm font-medium">{t("title")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("description")}</p>
      <Button type="button" className="mt-3 w-full rounded-full" onClick={open} disabled={pending}>
        {pending ? t("opening") : t("open")}
      </Button>
    </section>
  );
}
