import "server-only";

import { and, eq } from "drizzle-orm";

import { candidates, db, organization } from "@harly/db";

/** Offer terms shared by the server-action and REST API layers. Keeping the
 *  validation here prevents the two layers from drifting (they had already
 *  diverged — the API checked `expiresAt < startDate` and salary/currency
 *  consistency, the server action checked neither). */
export type OfferTerms = {
  salaryAmount: number | null;
  currency: string | null;
  salaryPeriod: "annual" | "monthly" | null;
  startDate: Date | null;
  expiresAt: Date | null;
};

export type TermsViolation = { ok: false; message: string };
export type TermsOk = { ok: true };
export type TermsResult = TermsOk | TermsViolation;

/**
 * Validate offer compensation + date terms. Returns a neutral result so both
 * the server-action layer (string errors) and the REST layer (ApiError) can
 * map it to their own error shape.
 *
 * Rules:
 *  - `expiresAt` must not be before `startDate` (when both are set).
 *  - `expiresAt`, when set, must be in the future. A draft whose expiry already
 *    passed can neither be sent nor accepted, so reject it at write time.
 *  - `currency`/`salaryPeriod` require a `salaryAmount`.
 */
export function assertOfferTerms(values: OfferTerms): TermsResult {
  if (
    values.expiresAt &&
    values.startDate &&
    values.expiresAt.getTime() < values.startDate.getTime()
  ) {
    return {
      ok: false,
      message: "Offer expiry cannot be before its start date.",
    };
  }
  if (
    values.expiresAt &&
    values.expiresAt.getTime() < Date.now()
  ) {
    return { ok: false, message: "Offer expiry cannot be in the past." };
  }
  if (values.salaryAmount === null) {
    if (values.currency !== null || values.salaryPeriod !== null) {
      return {
        ok: false,
        message: "Currency and salary period require a salary amount.",
      };
    }
  }
  return { ok: true };
}

/** Whether an offer's expiry has already passed. */
export function offerHasExpired(expiresAt: Date | null): boolean {
  return !!expiresAt && expiresAt.getTime() < Date.now();
}

export type OfferRecipient = {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
};

/** Candidate contact + company name for offer emails, workspace-scoped. Shared
 *  by both layers to avoid two copies of the same candidates ⨝ organization
 *  join drifting apart. */
export async function getOfferRecipient(
  workspaceId: string,
  candidateId: string,
): Promise<OfferRecipient | null> {
  const [row] = await db
    .select({
      email: candidates.email,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      companyName: organization.name,
    })
    .from(candidates)
    .innerJoin(organization, eq(organization.id, candidates.workspaceId))
    .where(
      and(
        eq(candidates.id, candidateId),
        eq(candidates.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
}
