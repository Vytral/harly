"use server";

import { cookies } from "next/headers";
import { createElement } from "react";
import { and, eq, asc } from "drizzle-orm";
import { z } from "zod";

import {
  applications,
  applicationAnswers,
  applicationQuestions,
  candidateFiles,
  db,
  jobs,
  jobStages,
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
  getPortalWorkspaceId,
  isPortalEnabled,
  resolvePortalSession,
} from "@/lib/portal-auth";

const emailSchema = z.string().email().max(254).toLowerCase().trim();

export type SendMagicLinkResult =
  | { ok: true }
  | { ok: false; error: string };

export async function sendPortalMagicLinkAction(
  email: string,
): Promise<SendMagicLinkResult> {
  if (!(await isPortalEnabled())) {
    return { ok: false, error: "Candidate portal is not enabled." };
  }

  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const workspaceId = await getPortalWorkspaceId();
  if (!workspaceId) {
    return { ok: false, error: "Workspace not found." };
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
    console.error("sendPortalMagicLinkAction error:", err);
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
  resumeUrl?: string;
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
      .select({ id: jobs.id, status: jobs.status })
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

    // Save resume to candidate files if provided
    if (input.resumeUrl) {
      await db.insert(candidateFiles).values({
        workspaceId: session.workspaceId,
        candidateId: session.candidateId,
        fileName: "Resume",
        fileUrl: input.resumeUrl,
        fileType: "resume",
      });
    }

    const questionKeys = Object.keys(input.answers);
    if (questionKeys.length > 0) {
      const questions = await db
        .select({ id: applicationQuestions.id, key: applicationQuestions.key })
        .from(applicationQuestions)
        .where(eq(applicationQuestions.jobId, input.jobId));

      const questionMap = new Map(questions.map((q) => [q.key, q.id]));

      const answerValues = questionKeys
        .filter((key) => input.answers[key]?.trim())
        .map((key) => ({
          workspaceId: session.workspaceId,
          applicationId: application.id,
          questionId: questionMap.get(key)!,
          answer: input.answers[key],
        }))
        .filter((a) => a.questionId);

      if (answerValues.length > 0) {
        await db.insert(applicationAnswers).values(answerValues);
      }
    }

    return { ok: true, applicationId: application.id };
  } catch {
    return { ok: false, error: "Unable to submit application." };
  }
}
