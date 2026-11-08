"use client";

import { useState, useTransition } from "react";

import { issueCandidatePortalCodeAction } from "@/features/portal/admin-actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/notification-island/toast";

type Issued = { kind: "access" | "reset"; url: string; expiresAt: string };

/**
 * Recruiter tool on the candidate record: issue a one-time portal link to hand
 * over by phone, chat or in person, for candidates who can't receive email.
 */
export function CandidatePortalAccessCard({ candidateId }: { candidateId: string }) {
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
      toast.success("Link copied");
    } catch {
      toast.error("Copy failed. Select the link and copy it manually.");
    }
  }

  return (
    <section
      aria-labelledby={`portal-access-${candidateId}`}
      className="rounded-xl border bg-card p-4"
    >
      <h3 id={`portal-access-${candidateId}`} className="text-sm font-semibold">
        Candidate portal access
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Create a one-time link to share through another channel. It works once
        and is shown only now.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => issue("access")}>
          Create access link
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => issue("reset")}>
          Create password reset link
        </Button>
      </div>
      {issued ? (
        <div className="mt-3 space-y-2" role="status">
          <label
            htmlFor={`portal-link-${candidateId}`}
            className="text-xs font-medium"
          >
            {issued.kind === "access" ? "Access link" : "Password reset link"}{" "}
            <span className="font-normal text-muted-foreground">
              (expires {new Date(issued.expiresAt).toLocaleString()})
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
              Copy
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
