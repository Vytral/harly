import { and, desc, eq, isNull } from "drizzle-orm";

import {
  applications,
  candidates,
  consentRecords,
  createDatabaseClient,
  documents,
  interviews,
  offers,
  scorecards,
  signatureEnvelopes,
} from "@harly/db";

import { E2E_DATABASE_URL, FIXTURE } from "./constants";

export async function readHiringState(email = FIXTURE.candidateEmail) {
  const { db, sql } = createDatabaseClient(E2E_DATABASE_URL);

  try {
    const [candidate] = await db
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
      })
      .from(candidates)
      .where(
        and(
          eq(candidates.workspaceId, FIXTURE.workspaceId),
          eq(candidates.email, email),
          isNull(candidates.deletedAt),
        ),
      )
      .limit(1);

    if (!candidate) {
      return { candidate: null, application: null, interview: null, scorecard: null, offer: null, envelope: null, document: null, consent: null };
    }

    const [application] = await db
      .select({
        id: applications.id,
        status: applications.status,
        currentStageId: applications.currentStageId,
      })
      .from(applications)
      .where(
        and(
          eq(applications.workspaceId, FIXTURE.workspaceId),
          eq(applications.candidateId, candidate.id),
          eq(applications.jobId, FIXTURE.jobId),
        ),
      )
      .orderBy(desc(applications.appliedAt))
      .limit(1);

    if (!application) {
      return { candidate, application: null, interview: null, scorecard: null, offer: null, envelope: null, document: null, consent: null };
    }

    const [[interview], [scorecard], [offer], [consent]] = await Promise.all([
      db
        .select({
          id: interviews.id,
          status: interviews.status,
          scheduledAt: interviews.scheduledAt,
          mode: interviews.mode,
        })
        .from(interviews)
        .where(eq(interviews.applicationId, application.id))
        .orderBy(desc(interviews.createdAt))
        .limit(1),
      db
        .select({
          id: scorecards.id,
          rating: scorecards.rating,
          comment: scorecards.comment,
          stageName: scorecards.stageName,
        })
        .from(scorecards)
        .where(eq(scorecards.applicationId, application.id))
        .orderBy(desc(scorecards.createdAt))
        .limit(1),
      db
        .select({
          id: offers.id,
          status: offers.status,
          title: offers.title,
          esignSubmissionId: offers.esignSubmissionId,
          signatureEnvelopeRefId: offers.signatureEnvelopeRefId,
        })
        .from(offers)
        .where(eq(offers.applicationId, application.id))
        .orderBy(desc(offers.createdAt))
        .limit(1),
      db
        .select({
          id: consentRecords.id,
          granted: consentRecords.granted,
          consentType: consentRecords.consentType,
        })
        .from(consentRecords)
        .where(eq(consentRecords.applicationId, application.id))
        .orderBy(desc(consentRecords.createdAt))
        .limit(1),
    ]);

    const envelope = offer?.signatureEnvelopeRefId
      ? (
          await db
            .select({
              id: signatureEnvelopes.id,
              provider: signatureEnvelopes.provider,
              status: signatureEnvelopes.status,
              completedAt: signatureEnvelopes.completedAt,
            })
            .from(signatureEnvelopes)
            .where(eq(signatureEnvelopes.id, offer.signatureEnvelopeRefId))
            .limit(1)
        )[0]
      : null;

    const document = envelope
      ? (
          await db
            .select({
              id: documents.id,
              signatureStatus: documents.signatureStatus,
              signatureProvider: documents.signatureProvider,
            })
            .from(documents)
            .where(eq(documents.signatureEnvelopeRefId, envelope.id))
            .limit(1)
        )[0]
      : null;

    return { candidate, application, interview: interview ?? null, scorecard: scorecard ?? null, offer: offer ?? null, envelope: envelope ?? null, document: document ?? null, consent: consent ?? null };
  } finally {
    await sql.end({ timeout: 1 });
  }
}
