"use server";

import { cookies } from "next/headers";
import { createElement } from "react";
import { and, eq, asc, count, gt } from "drizzle-orm";
import { z } from "zod";

import {
  applications,
  applicationAnswers,
  applicationQuestions,
  candidateFiles,
  db,
  jobs,
  jobStages,
  workspaceSettings,
  consentRecords,
  candidatePortalMagicLinks,
} from "@harly/db";
import {
  PortalMagicLinkEmail,
  createEmailSender,
  portalMagicLinkSubject,
} from "@harly/emails";
import {
  PORTAL_SESSION_COOKIE,
  createMagicLinkToken,
  deletePortalSession,
  getPortalWorkspaceBySlug,
  resolvePortalSession,
} from "@/lib/portal-auth";
import { createLogger } from "@/lib/logger";
import { normalizeJobApplicationConfig } from "@/features/jobs/config";
import { validatePortalApplication } from "@/features/portal/application-validation";

const log = createLogger("portal-actions");

const emailSchema = z.string().email().max(254).toLowerCase().trim();

export type SendMagicLinkResult = { ok: true } | { ok: false; error: string };

export async function sendPortalMagicLinkAction(
  email: string,
  workspaceSlug: string,
): Promise<SendMagicLinkResult> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const workspace = await getPortalWorkspaceBySlug(workspaceSlug);
  if (!workspace) {
    return { ok: false, error: "This candidate portal is unavailable." };
  }
  const workspaceId = workspace.id;

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

    const sender = createEmailSender();
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
        status: jobs.status,
        applicationConfig: jobs.applicationConfig,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.id, input.jobId),
          eq(jobs.workspaceId, session.workspaceId),
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
      .where(eq(jobStages.jobId, input.jobId))
      .orderBy(asc(jobStages.order))
      .limit(1);

    if (!firstStage) {
      return { ok: false, error: "Job pipeline not configured." };
    }

    const [application] = await db
      .insert(applications)
      .values({
        workspaceId: session.workspaceId,
        candidateId: session.candidateId,
        jobId: input.jobId,
        currentStageId: firstStage.id,
        status: "active",
      })
      .returning({ id: applications.id });

    if (!application) {
      return { ok: false, error: "Failed to create application." };
    }

    // Save only the server-validated, workspace-scoped upload key.
    if (input.resumeKey) {
      await db.insert(candidateFiles).values({
        workspaceId: session.workspaceId,
        candidateId: session.candidateId,
        fileName: "Resume",
        fileUrl: `/uploads/${input.resumeKey}`,
        fileType: "resume",
      });
    }

    if (Object.keys(validation.answers).length > 0) {
      const questionMap = new Map(questions.map((q) => [q.key, q.id]));
      const answerValues = Object.keys(validation.answers)
        .map((key) => ({
          workspaceId: session.workspaceId,
          applicationId: application.id,
          questionId: questionMap.get(key)!,
          answer: validation.answers[key],
        }))
        .filter((a) => a.questionId);

      if (answerValues.length > 0) {
        await db.insert(applicationAnswers).values(answerValues);
      }
    }

    if (input.consentGiven) {
      const consentText =
        settings?.consentCheckboxText ??
        "I agree to the privacy policy and consent to the processing of my personal data.";
      await db.insert(consentRecords).values({
        workspaceId: session.workspaceId,
        candidateId: session.candidateId,
        applicationId: application.id,
        consentType: "data_processing",
        consentText,
        granted: true,
      });
    }

    return { ok: true, applicationId: application.id };
  } catch (error) {
    log.error(error, "applyToJobAction failed");
    return { ok: false, error: "Unable to submit application." };
  }
}
