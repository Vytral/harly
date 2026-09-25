import "server-only";

import { and, eq, isNull } from "drizzle-orm";

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

/** JSON-safe immutable terms captured when a send is requested. */
export type OfferTermsSnapshot = OfferTerms & {
  title: string;
  equity: string | null;
  notes: string | null;
};

export type SerializedOfferTermsSnapshot = Omit<
  OfferTermsSnapshot,
  "startDate" | "expiresAt"
> & {
  startDate: string | null;
  expiresAt: string | null;
};

export function snapshotOfferTerms(input: {
  title: string;
  salaryAmount: number | null;
  currency: string | null;
  salaryPeriod: "annual" | "monthly" | null;
  equity: string | null;
  startDate: Date | null;
  expiresAt: Date | null;
  notes: string | null;
}): OfferTermsSnapshot {
  return {
    title: input.title,
    salaryAmount: input.salaryAmount,
    currency: input.currency,
    salaryPeriod: input.salaryPeriod,
    equity: input.equity,
    startDate: input.startDate,
    expiresAt: input.expiresAt,
    notes: input.notes,
  };
}

export function serializeOfferTermsSnapshot(
  snapshot: OfferTermsSnapshot,
): SerializedOfferTermsSnapshot {
  return {
    ...snapshot,
    startDate: snapshot.startDate?.toISOString() ?? null,
    expiresAt: snapshot.expiresAt?.toISOString() ?? null,
  };
}

export function parseOfferTermsSnapshot(
  value: unknown,
): OfferTermsSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SerializedOfferTermsSnapshot>;
  if (
    typeof candidate.title !== "string" ||
    (candidate.startDate !== null && typeof candidate.startDate !== "string") ||
    (candidate.expiresAt !== null && typeof candidate.expiresAt !== "string")
  ) {
    return null;
  }
  const startDate = candidate.startDate ? new Date(candidate.startDate) : null;
  const expiresAt = candidate.expiresAt ? new Date(candidate.expiresAt) : null;
  if (
    (startDate && Number.isNaN(startDate.getTime())) ||
    (expiresAt && Number.isNaN(expiresAt.getTime()))
  ) {
    return null;
  }
  return {
    title: candidate.title,
    salaryAmount: candidate.salaryAmount ?? null,
    currency: candidate.currency ?? null,
    salaryPeriod: candidate.salaryPeriod ?? null,
    equity: candidate.equity ?? null,
    startDate,
    expiresAt,
    notes: candidate.notes ?? null,
  };
}

function sameDate(left: Date | null, right: Date | null) {
  return left?.getTime() === right?.getTime();
}

/** Compare the mutable offer row to the frozen terms in an outbox payload. */
export function offerMatchesTerms(
  offer: OfferTermsSnapshot,
  snapshot: OfferTermsSnapshot,
): boolean {
  return (
    offer.title === snapshot.title &&
    offer.salaryAmount === snapshot.salaryAmount &&
    offer.currency === snapshot.currency &&
    offer.salaryPeriod === snapshot.salaryPeriod &&
    offer.equity === snapshot.equity &&
    sameDate(offer.startDate, snapshot.startDate) &&
    sameDate(offer.expiresAt, snapshot.expiresAt) &&
    offer.notes === snapshot.notes
  );
}

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

/** Draft letters are only exposed to the authenticated field-placement flow. */
export function canDownloadOfferLetter(
  status: string,
  purpose: string | null,
): boolean {
  return status !== "withdrawn" && (status !== "draft" || purpose === "placement");
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
        isNull(candidates.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}
