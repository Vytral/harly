/** Client-safe offer types and labels. */

export type OfferStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "declined"
  | "withdrawn";

export const OFFER_STATUS_META: Record<
  OfferStatus,
  { label: string; variant: "neutral" | "info" | "success" | "danger" }
> = {
  draft: { label: "Draft", variant: "neutral" },
  sent: { label: "Sent", variant: "info" },
  accepted: { label: "Accepted", variant: "success" },
  declined: { label: "Declined", variant: "danger" },
  withdrawn: { label: "Withdrawn", variant: "neutral" },
};

export type CandidateOfferItem = {
  id: string;
  applicationId: string;
  jobTitle: string;
  status: OfferStatus;
  title: string;
  salaryAmount: number | null;
  currency: string | null;
  salaryPeriod: "annual" | "monthly" | null;
  equity: string | null;
  startDate: string | null;
  expiresAt: string | null;
  notes: string | null;
  createdByName: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export function formatOfferComp(offer: {
  salaryAmount: number | null;
  currency: string | null;
  salaryPeriod: "annual" | "monthly" | null;
}): string | null {
  if (offer.salaryAmount == null) return null;
  const amount = new Intl.NumberFormat("en-US").format(offer.salaryAmount);
  const currency = offer.currency ?? "";
  const period =
    offer.salaryPeriod === "monthly"
      ? "/month"
      : offer.salaryPeriod === "annual"
        ? "/year"
        : "";
  return `${currency} ${amount}${period}`.trim();
}
