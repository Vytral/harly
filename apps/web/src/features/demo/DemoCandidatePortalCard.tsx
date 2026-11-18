"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/notification-island/toast";

import { openDemoCandidatePortalAction } from "./candidate-portal-actions";

/**
 * Demo sandbox only (the page renders it only there, and the action re-checks
 * everything on the server): open the candidate portal as this seeded candidate.
 */
export function DemoCandidatePortalCard({ candidateId }: { candidateId: string }) {
  const t = useTranslations("features.demo.demoCandidatePortalCard");
  const [pending, start] = useTransition();

  function open() {
    start(async () => {
      const result = await openDemoCandidatePortalAction({ candidateId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // Full navigation so the portal layout reads the fresh session cookie.
      window.location.assign(result.url);
    });
  }

  return (
    <section
      aria-labelledby={`demo-portal-${candidateId}`}
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
    >
      <div className="min-w-0 flex-1">
        <h3 id={`demo-portal-${candidateId}`} className="text-sm font-semibold">
          {t("title")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">{t("description")}</p>
      </div>
      <Button size="sm" disabled={pending} onClick={open}>
        {t("open")}
      </Button>
    </section>
  );
}
