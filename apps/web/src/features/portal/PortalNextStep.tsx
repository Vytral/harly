import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Route } from "next";
import { FileSignature, Upload, Coffee } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PortalInterviewItem, type PortalInterviewItemData } from "./PortalInterviewItem";

export type PortalNextStepData =
  | { kind: "offer"; applicationId: string; jobTitle: string; offerTitle: string | null }
  | { kind: "documents"; applicationId: string; jobTitle: string; count: number }
  | { kind: "interview"; applicationId: string; jobTitle: string; interview: PortalInterviewItemData }
  | { kind: "waiting"; headline: string; body: string };

/**
 * The one thing that needs the candidate now, picked in priority order by the
 * page: an offer to sign, documents to upload, the next interview, or a calm
 * "nothing to do" with where things stand.
 */
export function PortalNextStep({ step, orgName }: { step: PortalNextStepData; orgName: string }) {
  const t = useTranslations("portal.nextStep");
  if (step.kind === "interview") {
    return (
      <section aria-labelledby="next-step-title" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="next-step-title" className="text-[13px] font-semibold uppercase tracking-wider text-soft-ink">
            {t("upNext")}
          </h2>
          <Link
            href={`/portal/applications/${step.applicationId}` as Route}
            className="truncate text-[13px] text-soft-ink underline-offset-2 hover:text-near-ink hover:underline"
          >
            {step.jobTitle}
          </Link>
        </div>
        <PortalInterviewItem interview={step.interview} orgName={orgName} />
      </section>
    );
  }

  const action =
    step.kind === "offer"
      ? {
          icon: FileSignature,
          eyebrow: t("actionNeeded"),
          title: step.offerTitle ? t("reviewAndSign", { title: step.offerTitle }) : t("offerTitle"),
          body: t("offerBody", { orgName, jobTitle: step.jobTitle }),
          cta: t("reviewOffer"),
          href: `/portal/applications/${step.applicationId}`,
        }
      : step.kind === "documents"
        ? {
            icon: Upload,
            eyebrow: t("actionNeeded"),
            title: t("documentsTitle", { count: step.count }),
            body: t("documentsBody", { orgName, jobTitle: step.jobTitle }),
            cta: t("uploadDocuments"),
            href: `/portal/applications/${step.applicationId}#documents`,
          }
        : null;

  if (!action) {
    if (step.kind !== "waiting") return null;
    return (
      <section className="flex items-start gap-4 rounded-2xl border border-hairline bg-card p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card-inset text-soft-ink">
          <Coffee className="size-5" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-near-ink">{step.headline}</p>
          <p className="mt-1 text-[13.5px] leading-5 text-soft-ink">{step.body}</p>
        </div>
      </section>
    );
  }

  const Icon = action.icon;
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl bg-near-ink p-5 text-pure-snow sm:p-6",
        "flex flex-col gap-4 sm:flex-row sm:items-center",
      )}
    >
      <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-lime/25 blur-3xl" />
      <span className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-lime text-lime-ink">
        <Icon className="size-5" strokeWidth={1.9} />
      </span>
      <div className="relative min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-lime">{action.eyebrow}</p>
        <p className="mt-1 text-[17px] font-semibold leading-snug">{action.title}</p>
        <p className="mt-1 text-[13.5px] leading-5 text-pure-snow/70">{action.body}</p>
      </div>
      <Button asChild className="relative shrink-0 bg-lime text-lime-ink hover:bg-lime/90">
        <Link href={action.href as Route}>{action.cta}</Link>
      </Button>
    </section>
  );
}
