"use server";

import { cookies, headers } from "next/headers";
import { createElement } from "react";
import { and, eq, asc, count, desc, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import {
  applications,
  applicationStageHistory,
  activityEvents,
  applicationAnswers,
  applicationQuestions,
  candidateFiles,
  db,
  jobs,
  jobStages,
  offers,
  signatureRecipients,
  workspaceSettings,
  consentRecords,
  candidatePortalMagicLinks,
  member as authMembers,
  organization,
  user as authUsers,
} from "@harly/db";
import {
  PortalMagicLinkEmail,
  portalMagicLinkSubject,
} from "@harly/emails";
import {
  PORTAL_SESSION_COOKIE,
  createMagicLinkToken,
  deletePortalSession,
  getSinglePortalWorkspace,
  resolvePortalSession,
} from "@/lib/portal-auth";
import { getWorkspaceEmailSender } from "@/lib/email";
import { createLogger } from "@/lib/logger";
import { normalizeJobApplicationConfig } from "@/features/jobs/config";
import { validatePortalApplication } from "@/features/portal/application-validation";
import { sendApplicationReceivedEmails } from "@/features/applications/notifications";
import { verifyResumeUpload } from "@/features/applications/resume-upload";
import { lockApplicationPipelineOrder } from "@/features/applications/pipeline-order";
import { getApplicationConflictMessage } from "@/features/applications/data";
import {
  persistDomainEvent,
  publishPersistedDomainEvents,
} from "@/server/events/emit";
import { emitWebhookEvent } from "@/server/webhooks/emit";
import { clientIp, enforceRateLimit } from "@/server/api/ratelimit";
import { offerHasExpired } from "@/features/offers/core";
import { freshEsignContext, getSubmission } from "@/lib/esign/client";
import { signerSigningUrl } from "@/lib/esign/offer-signing";

const log = createLogger("portal-actions");

const emailSchema = z.string().email().max(254).toLowerCase().trim();

export type SendMagicLinkResult = { ok: true } | { ok: false; error: string };

// Used as the form's progressive-enhancement action. This ensures a submit
// that happens before the client component hydrates is still handled by the
// server action instead of falling back to GET /portal/login?email=....
export async function sendPortalMagicLinkFormAction(
  formData: FormData,
): Promise<void> {
  const email = formData.get("email");
  await sendPortalMagicLinkAction(
    typeof email === "string" ? email : "",
  );
}

export async function sendPortalMagicLinkAction(
  email: string,
): Promise<SendMagicLinkResult> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const workspace = await getSinglePortalWorkspace();
  if (!workspace) {
    return { ok: false, error: "This candidate portal is unavailable." };
  }
  const workspaceId = workspace.id;

  const requestHeaders = await headers();
  const ip = clientIp(
    new Request("http://harly.local", {
      headers: {
        "x-forwarded-for": requestHeaders.get("x-forwarded-for") ?? "",
        "x-real-ip": requestHeaders.get("x-real-ip") ?? "",
      },
    }),
  );
  try {
    await enforceRateLimit(`public:portal-magic:${ip}`, {
      limit: 10,
      windowMs: 15 * 60_000,
    });
  } catch {
    return { ok: true };
  }

  // Limit delivery per recipient as well as token creation. Replacing an
  // unconsumed token alone does not stop an unauthenticated caller from
  // repeatedly sending branded mail.
  const [recent] = await db
    .select({ count: count() })
    .from(candidatePortalMagicLinks)
    .where(
      and(
        eq(candidatePortalMagicLinks.workspaceId, workspaceId),
        eq(candidatePortalMagicLinks.email, parsed.data),
        gt(
          candidatePortalMagicLinks.createdAt,
          new Date(Date.now() - 15 * 60_000),
        ),
      ),
    );
  if ((recent?.count ?? 0) >= 3) {
    return { ok: true };
  }

  try {
    const token = await createMagicLinkToken(workspaceId, parsed.data);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const url = `${appUrl}/api/portal/auth/magic?token=${token}`;

    const sender = await getWorkspaceEmailSender(workspaceId);
    if (sender) {
      await sender.send({
        to: parsed.data,
        subject: portalMagicLinkSubject(),
        react: createElement(PortalMagicLinkEmail, { loginUrl: url }),
      });
    } else {
      // Dev fallback: magic link URL is logged server-side when no email sender is configured.
    }

    return { ok: true };
  } catch (err) {
    log.error(err, "sendPortalMagicLinkAction failed");
    return { ok: false, error: "Could not send the sign-in link. Try again." };
  }
}

export async function signOutPortalAction(): Promise<void> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (raw) {
    await deletePortalSession(raw);
    cookieStore.delete(PORTAL_SESSION_COOKIE);
  }
}

type ApplyInput = {
  jobId: string;
  answers: Record<string, string>;
  resumeKey?: string;
  resumeFileName?: string;
  resumeFileType?: string;
  resumeFileSize?: number;
  consentGiven?: boolean;
};

export async function applyToJobAction(
  input: ApplyInput,
): Promise<{ ok: boolean; applicationId?: string; error?: string }> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    if (!token) return { ok: false, error: "Unauthorized." };

    const session = await resolvePortalSession(token);
    if (!session) return { ok: false, error: "Unauthorized." };

    const [job] = await db
      .select({
        id: jobs.id,
        title: jobs.title,
        status: jobs.status,
        applicationConfig: jobs.applicationConfig,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.id, input.jobId),
          eq(jobs.workspaceId, session.workspaceId),
          isNull(jobs.deletedAt),
        ),
      )
      .limit(1);

    if (!job || job.status !== "open") {
      return { ok: false, error: "Job is no longer open." };
    }

    const questions = await db
      .select({
        id: applicationQuestions.id,
        key: applicationQuestions.key,
        type: applicationQuestions.type,
        required: applicationQuestions.required,
        minLength: applicationQuestions.minLength,
        options: applicationQuestions.options,
      })
      .from(applicationQuestions)
      .where(
        and(
          eq(applicationQuestions.workspaceId, session.workspaceId),
          eq(applicationQuestions.jobId, input.jobId),
        ),
      );
    const applicationConfig = normalizeJobApplicationConfig(
      job.applicationConfig,
    );
    const validation = validatePortalApplication({
      workspaceId: session.workspaceId,
      resumeRequired:
        applicationConfig.sections.profile.resume.visibility === "required",
      resumeKey: input.resumeKey,
      answers: input.answers,
      questions,
    });
    if (!validation.ok) return validation;

    const verifiedResume = input.resumeKey
      ? await verifyResumeUpload({
          workspaceId: session.workspaceId,
          key: input.resumeKey,
          fileName: input.resumeFileName,
          fileType: input.resumeFileType,
          fileSize: input.resumeFileSize,
        })
      : null;
    if (input.resumeKey && !verifiedResume) {
      return { ok: false, error: "Resume upload is invalid." };
    }

    const [settings] = await db
      .select({
        consentCheckboxText: workspaceSettings.consentCheckboxText,
        legalConfigured: workspaceSettings.legalConfigured,
        legalPages: workspaceSettings.legalPages,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.organizationId, session.workspaceId))
      .limit(1);
    if (settings?.legalConfigured && !input.consentGiven) {
      return {
        ok: false,
        error: "You must consent to data processing to apply.",
      };
    }

    const consentHeaders = input.consentGiven ? await headers() : null;
    const consentIp = consentHeaders
      ? clientIp(
          new Request("http://harly.local", {
            headers: {
              "x-forwarded-for": consentHeaders.get("x-forwarded-for") ?? "",
              "x-real-ip": consentHeaders.get("x-real-ip") ?? "",
            },
          }),
        )
      : null;
    const consentUserAgent = consentHeaders?.get("user-agent") ?? null;

    const [existing] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.candidateId, session.candidateId),
          eq(applications.jobId, input.jobId),
          eq(applications.workspaceId, session.workspaceId),
        ),
      )
      .limit(1);

    if (existing) {
      return { ok: false, error: "You have already applied to this job." };
    }

    const [firstStage] = await db
      .select({ id: jobStages.id })
      .from(jobStages)
      .where(
        and(
          eq(jobStages.workspaceId, session.workspaceId),
          eq(jobStages.jobId, input.jobId),
        ),
      )
      .orderBy(asc(jobStages.order))
      .limit(1);

    if (!firstStage) {
      return { ok: false, error: "Job pipeline not configured." };
    }

    const application = await db.transaction(async (tx) => {
      await lockApplicationPipelineOrder(
        tx,
        session.workspaceId,
        firstStage.id,
      );
      const [nextPipelineOrder] = await tx
        .select({
          value: sql<number>`coalesce(max(${applications.pipelineOrder}), 0) + 1`,
        })
        .from(applications)
        .where(
          and(
            eq(applications.workspaceId, session.workspaceId),
            eq(applications.currentStageId, firstStage.id),
          ),
        );
      const [created] = await tx
        .insert(applications)
        .values({
          workspaceId: session.workspaceId,
          candidateId: session.candidateId,
          jobId: input.jobId,
          currentStageId: firstStage.id,
          pipelineOrder: nextPipelineOrder?.value ?? 1,
          source: "portal",
          status: "active",
        })
        .returning({ id: applications.id });

      if (!created) throw new Error("Failed to create application.");

      await tx.insert(applicationStageHistory).values({
        workspaceId: session.workspaceId,
        applicationId: created.id,
        fromStageId: null,
        toStageId: firstStage.id,
        movedById: null,
      });
      await tx.insert(activityEvents).values({
        workspaceId: session.workspaceId,
        actorId: null,
        entityType: "application",
        entityId: created.id,
        type: "application.created",
        metadata: { source: "portal", jobId: input.jobId },
      });

      if (verifiedResume) {
        await tx.insert(candidateFiles).values({
          workspaceId: session.workspaceId,
          candidateId: session.candidateId,
          fileName: verifiedResume.fileName,
          fileUrl: verifiedResume.fileUrl,
          fileType: verifiedResume.fileType,
          fileSize: verifiedResume.fileSize,
        });
      }

      if (Object.keys(validation.answers).length > 0) {
        const questionMap = new Map(questions.map((q) => [q.key, q.id]));
        const answerValues = Object.keys(validation.answers)
          .map((key) => ({
            workspaceId: session.workspaceId,
            applicationId: created.id,
            questionId: questionMap.get(key)!,
            answer: validation.answers[key],
          }))
          .filter((a) => a.questionId);
        if (answerValues.length > 0) {
          await tx.insert(applicationAnswers).values(answerValues);
        }
      }

      if (input.consentGiven) {
        const consentText =
          settings?.consentCheckboxText ??
          "I agree to the privacy policy and consent to the processing of my personal data.";
        await tx.insert(consentRecords).values({
          workspaceId: session.workspaceId,
          candidateId: session.candidateId,
          applicationId: created.id,
          consentType: "data_processing",
          consentText,
          granted: true,
          ipAddress: consentIp,
          userAgent: consentUserAgent,
        });
      }

      const domainEvent = await persistDomainEvent(tx, {
        name: "application.created",
        workspaceId: session.workspaceId,
        aggregateType: "application",
        aggregateId: created.id,
        payload: {
          application: { id: created.id, jobId: input.jobId },
          candidate: {
            id: session.candidateId,
            email: session.email,
            name: `${session.firstName} ${session.lastName}`.trim(),
          },
          job: { id: input.jobId, title: job.title },
        },
      });

      return { ...created, domainEvent };
    });

    await publishPersistedDomainEvents([application.domainEvent]);
    await emitWebhookEvent(
      session.workspaceId,
      "application.created",
      {
        application: { id: application.id, jobId: input.jobId },
        candidate: {
          id: session.candidateId,
          email: session.email,
          name: `${session.firstName} ${session.lastName}`.trim(),
        },
        job: { id: input.jobId, title: job.title },
      },
      {
        skipDomainEvent: true,
        eventId: application.domainEvent.eventId,
      },
    );

    // Keep portal submissions on the same durable email path as public
    // applications. Email delivery must never turn a successful application
    // into a failed request, so delivery errors are logged and retried by the
    // outbox worker without changing the candidate-facing result.
    try {
      const [[workspace], owners] = await Promise.all([
        db
          .select({ name: organization.name, slug: organization.slug })
          .from(organization)
          .where(eq(organization.id, session.workspaceId))
          .limit(1),
        db
          .select({ email: authUsers.email })
          .from(authMembers)
          .innerJoin(authUsers, eq(authUsers.id, authMembers.userId))
          .where(
            and(
              eq(authMembers.organizationId, session.workspaceId),
              eq(authMembers.role, "owner"),
            ),
          ),
      ]);

      if (workspace) {
        await sendApplicationReceivedEmails({
          workspaceId: session.workspaceId,
          workspaceName: workspace.name,
          workspaceSlug: workspace.slug,
          applicationId: application.id,
          portalEnabled: true,
          candidateEmail: session.email,
          candidateFirstName: session.firstName,
          candidateName: `${session.firstName} ${session.lastName}`.trim(),
          jobTitle: job.title,
          ownerEmails: owners.map((owner) => owner.email),
        });
      }
    } catch (emailError) {
      log.error(emailError, "Portal application email delivery failed");
    }

    return { ok: true, applicationId: application.id };
  } catch (error) {
    const conflict = getApplicationConflictMessage(error);
    if (conflict) return { ok: false, error: conflict };
    log.error(error, "applyToJobAction failed");
    return { ok: false, error: "Unable to submit application." };
  }
}

/**
 * Return the DocuSeal hosted signing URL for an offer the candidate was sent via
 * e-signature. Auth is the candidate portal session (JWT), not a dashboard
 * session. Signing URLs are bearer credentials: they are generated from a
 * fresh, provider-verified response and never persisted or reused from the
 * recipient row. `completed_redirect_url` was baked into the submission and
 * returns the candidate to the portal after signing.
 */
export async function createOfferSigningViewAction(input: {
  applicationId: string;
}): Promise<{ ok: true; signingUrl: string } | { ok: false; error: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) return { ok: false, error: "Your session has expired." };
  const session = await resolvePortalSession(token);
  if (!session) return { ok: false, error: "Your session has expired." };

  // The offer must belong to this candidate's application in this workspace and
  // be an e-signature offer still awaiting decision.
  const [offer] = await db
    .select({
      id: offers.id,
      status: offers.status,
      esignSubmissionId: offers.esignSubmissionId,
      signatureEnvelopeRefId: offers.signatureEnvelopeRefId,
      candidateId: offers.candidateId,
      expiresAt: offers.expiresAt,
      applicationStatus: applications.status,
    })
    .from(offers)
    .innerJoin(
      applications,
      and(
        eq(applications.id, offers.applicationId),
        eq(applications.workspaceId, offers.workspaceId),
      ),
    )
    .where(
      and(
        eq(offers.workspaceId, session.workspaceId),
        eq(offers.applicationId, input.applicationId),
        eq(offers.candidateId, session.candidateId),
        eq(offers.status, "sent"),
        eq(applications.status, "active"),
      ),
    )
    .orderBy(desc(offers.createdAt))
    .limit(1);

  if (!offer || !offer.esignSubmissionId || !offer.signatureEnvelopeRefId) {
    return { ok: false, error: "No offer is waiting for your signature." };
  }
  if (offerHasExpired(offer.expiresAt)) {
    return { ok: false, error: "This offer has expired and is no longer actionable." };
  }

  const [recipient] = await db
    .select({
      providerRecipientId: signatureRecipients.providerRecipientId,
      email: signatureRecipients.email,
      clientUserId: signatureRecipients.clientUserId,
    })
    .from(signatureRecipients)
    .where(
      and(
        eq(signatureRecipients.workspaceId, session.workspaceId),
        eq(signatureRecipients.envelopeId, offer.signatureEnvelopeRefId),
      ),
    )
    .orderBy(asc(signatureRecipients.routingOrder))
    .limit(1);

  if (!recipient) {
    return { ok: false, error: "Electronic signing is not available for this offer." };
  }

  const ctx = await freshEsignContext(session.workspaceId);
  if (!ctx) {
    return { ok: false, error: "Electronic signing is not available for this offer." };
  }

  let submission;
  try {
    submission = await getSubmission(ctx, offer.esignSubmissionId);
  } catch (error) {
    log.warn({ error, offerId: offer.id }, "Could not refresh DocuSeal signing session");
    return { ok: false, error: "Electronic signing is temporarily unavailable." };
  }

  if (
    String(submission.id) !== offer.esignSubmissionId ||
    ["completed", "archived", "declined", "expired"].includes(
      submission.status?.toLowerCase() ?? "",
    )
  ) {
    return { ok: false, error: "This offer is no longer waiting for your signature." };
  }

  // Correlate with provider-owned submitter fields and the local recipient row.
  // Submission metadata is intentionally not used as identity.
  const signer = submission.submitters.find(
    (candidate) =>
      String(candidate.id) === recipient.providerRecipientId &&
      candidate.external_id === session.candidateId &&
      candidate.email?.toLowerCase() === recipient.email.toLowerCase() &&
      (!recipient.clientUserId || recipient.clientUserId === session.candidateId),
  );
  const signingUrl = signerSigningUrl(ctx.baseUrl, signer);
  if (!signingUrl) {
    return { ok: false, error: "Electronic signing is not available for this offer." };
  }
  return { ok: true, signingUrl };
}
