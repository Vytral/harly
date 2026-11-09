"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { issueCandidatePortalCodeAction } from "@/features/portal/admin-actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/notification-island/toast";

type Issued = { kind: "access" | "reset"; url: string; expiresAt: string };

/**
 * Recruiter tool on the candidate record: issue a one-time portal link to hand
 * over by phone, chat or in person, for candidates who can't receive email.
 */
export function CandidatePortalAccessCard({ candidateId }: { candidateId: string }) {
  const t = useTranslations("features.portal.CandidatePortalAccessCard");
  const [issued, setIssued] = useState<Issued | null>(null);
  const [pending, start] = useTransition();

  function issue(kind: "access" | "reset") {
    start(async () => {
      const result = await issueCandidatePortalCodeAction({ candidateId, kind });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setIssued({ kind, url: result.url, expiresAt: result.expiresAt });
    });
  }

  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      toast.success(t("linkCopied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  return (
    <section
      aria-labelledby={`portal-access-${candidateId}`}
      className="rounded-xl border bg-card p-4"
    >
      <h3 id={`portal-access-${candidateId}`} className="text-sm font-semibold">
        {t("title")}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("description")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => issue("access")}>
          {t("createAccessLink")}
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => issue("reset")}>
          {t("createResetLink")}
        </Button>
      </div>
      {issued ? (
        <div className="mt-3 space-y-2" role="status">
          <label
            htmlFor={`portal-link-${candidateId}`}
            className="text-xs font-medium"
          >
            {issued.kind === "access" ? t("accessLink") : t("resetLink")}{" "}
            <span className="font-normal text-muted-foreground">
              {t("expires", { date: new Date(issued.expiresAt).toLocaleString() })}
            </span>
          </label>
          <div className="flex gap-2">
            <input
              id={`portal-link-${candidateId}`}
              readOnly
              value={issued.url}
              onFocus={(e) => e.currentTarget.select()}
              className="h-9 min-w-0 flex-1 rounded-lg border bg-muted/40 px-2.5 font-mono text-xs"
            />
            <Button size="sm" onClick={copy}>
              {t("copy")}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
