"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, X } from "lucide-react";
import { toast } from "@/lib/notification-island/toast";

import {
  deleteReferral,
  toggleReferralFeatured,
} from "@/features/candidates/referrals/actions";
import { cn } from "@/lib/utils";

export type CandidateReferralItem = {
  id: string;
  note: string | null;
  featured: boolean;
  createdAt: string;
  jobId: string | null;
  jobTitle: string | null;
  referredById: string;
  referredByName: string;
  createdById: string;
  createdByName: string;
};

export function CandidateReferrals({
  referrals,
  currentUserId,
  canEditCandidates,
}: {
  referrals: CandidateReferralItem[];
  currentUserId: string;
  canEditCandidates: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (referrals.length === 0) return null;

  function toggleFeatured(referralId: string, next: boolean) {
    startTransition(async () => {
      const result = await toggleReferralFeatured({ referralId, featured: next });
      if (!result.success) {
        toast.error(result.error ?? "Unable to update referral.");
        return;
      }
      router.refresh();
    });
  }

  function remove(referralId: string) {
    startTransition(async () => {
      const result = await deleteReferral({ referralId });
      if (!result.success) {
        toast.error(result.error ?? "Unable to delete referral.");
        return;
      }
      toast.success("Referral removed");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-start gap-2">
      {referrals.map((referral) => {
        const canDelete = canEditCandidates || referral.createdById === currentUserId;
        return (
          <div
            key={referral.id}
            title={referral.note ?? undefined}
            className={cn(
              "flex max-w-full items-start gap-2 rounded-xl border px-3 py-2 text-xs",
              referral.featured
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-border bg-accent/50 text-accent-foreground",
            )}
          >
            <div className="min-w-0">
              <p className="font-medium">
                Referred by {referral.referredByName}
                {referral.jobTitle ? ` · ${referral.jobTitle}` : ""}
              </p>
              {referral.note ? (
                <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
                  {referral.note}
                </p>
              ) : null}
              {referral.createdById !== referral.referredById ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Logged by {referral.createdByName}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
            {canEditCandidates ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => toggleFeatured(referral.id, !referral.featured)}
                title={referral.featured ? "Unfeature" : "Feature this referral"}
                className="text-current opacity-70 hover:opacity-100"
              >
                <Star className={cn("size-3", referral.featured && "fill-current")} />
              </button>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => remove(referral.id)}
                title="Remove referral"
                className="text-current opacity-70 hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
