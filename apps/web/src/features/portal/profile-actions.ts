"use server";

import { cookies } from "next/headers";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getTranslations } from "@/i18n/server";

import { candidates, db, dsarRequests } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { createLogger } from "@/lib/logger";
import {
  isOwnedAvatarUrl,
  portalEmailPreferenceSchema,
  portalProfileSchema,
  type PortalProfileInput,
} from "./profile-validation";

const log = createLogger("portal-profile");

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Schema messages that are stable codes; anything else (zod defaults) falls back. */
const PROFILE_MESSAGE_KEYS = [
  "firstNameRequired",
  "phoneInvalid",
  "urlInvalid",
  "urlProtocol",
  "textTooLong",
  "emailLanguageInvalid",
];

function issueMessage(t: Translate, message: string | undefined, fallback: string): string {
  return message && PROFILE_MESSAGE_KEYS.includes(message) ? t(message) : t(fallback);
}

export async function updatePortalProfileAction(
  profile: PortalProfileInput,
): Promise<{ ok: boolean; error?: string }> {
  const t = await getTranslations("server.portal.profile");
  try {
    const parsedProfile = portalProfileSchema.safeParse(profile);
    if (!parsedProfile.success) {
      return { ok: false, error: issueMessage(t, parsedProfile.error.issues[0]?.message, "invalidDetails") };
    }
    const cookieStore = await cookies();
    const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    if (!token) return { ok: false, error: t("unauthorized") };

    const session = await resolvePortalSession(token);
    if (!session) return { ok: false, error: t("unauthorized") };

    const [candidate] = await db
      .update(candidates)
      .set({
        firstName: parsedProfile.data.firstName,
        lastName: parsedProfile.data.lastName ?? "",
        phone: parsedProfile.data.phone,
        location: parsedProfile.data.location,
        linkedinUrl: parsedProfile.data.linkedinUrl,
        githubUrl: parsedProfile.data.githubUrl,
        websiteUrl: parsedProfile.data.websiteUrl,
        headline: parsedProfile.data.headline,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(candidates.id, session.candidateId),
          eq(candidates.workspaceId, session.workspaceId),
        ),
      )
      .returning({ id: candidates.id });

    if (!candidate) {
      return { ok: false, error: t("candidateNotFound") };
    }

    return { ok: true };
  } catch (error) {
    log.error(error, "updatePortalProfileAction failed");
    return { ok: false, error: t("updateProfileFailed") };
  }
}

/** Save the authenticated candidate's explicit transactional email language. */
export async function updatePortalEmailPreferenceAction(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const t = await getTranslations("server.portal.profile");
  try {
    const parsed = portalEmailPreferenceSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: issueMessage(t, parsed.error.issues[0]?.message, "emailLanguageInvalid"),
      };
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const session = token ? await resolvePortalSession(token) : null;
    if (!session) return { ok: false, error: t("unauthorized") };

    const [candidate] = await db
      .update(candidates)
      .set({
        preferredEmailLocale: parsed.data.preferredEmailLocale,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(candidates.id, session.candidateId),
          eq(candidates.workspaceId, session.workspaceId),
          isNull(candidates.deletedAt),
        ),
      )
      .returning({ id: candidates.id });

    if (!candidate) return { ok: false, error: t("candidateNotFound") };
    return { ok: true };
  } catch (error) {
    log.error(error, "updatePortalEmailPreferenceAction failed");
    return { ok: false, error: t("updateEmailLanguageFailed") };
  }
}

export async function updatePortalCandidateAvatarAction(input: {
  avatarUrl: string | null;
  key?: string;
}): Promise<{ success: boolean; error?: string }> {
  const t = await getTranslations("server.portal.profile");
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    if (!token) return { success: false, error: t("unauthorized") };

    const session = await resolvePortalSession(token);
    if (!session) return { success: false, error: t("unauthorized") };

    if (
      input.avatarUrl !== null &&
      !isOwnedAvatarUrl(session.workspaceId, input.key, input.avatarUrl)
    ) {
      return { success: false, error: t("avatarNotOwned") };
    }

    const [candidate] = await db
      .update(candidates)
      .set({
        avatarUrl: input.avatarUrl,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(candidates.id, session.candidateId),
          eq(candidates.workspaceId, session.workspaceId),
        ),
      )
      .returning({ id: candidates.id });

    if (!candidate) {
      return { success: false, error: t("candidateNotFound") };
    }

    return { success: true };
  } catch (error) {
    log.error(error, "updatePortalCandidateAvatarAction failed");
    return { success: false, error: t("updateAvatarFailed") };
  }
}

/** Records a verified candidate's erasure request for staff review and fulfilment. */
export async function requestPortalErasureAction(): Promise<{
  ok: boolean;
  error?: string;
  status?: "pending" | "processing";
}> {
  const t = await getTranslations("server.portal.profile");
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const session = token ? await resolvePortalSession(token) : null;
    if (!session) return { ok: false, error: t("unauthorized") };

    const [existing] = await db
      .select({ status: dsarRequests.status })
      .from(dsarRequests)
      .where(
        and(
          eq(dsarRequests.workspaceId, session.workspaceId),
          eq(dsarRequests.candidateId, session.candidateId),
          eq(dsarRequests.type, "erasure"),
          inArray(dsarRequests.status, ["pending", "processing"]),
        ),
      )
      .limit(1);
    if (existing?.status === "pending" || existing?.status === "processing") {
      return { ok: true, status: existing.status };
    }

    await db.insert(dsarRequests).values({
      workspaceId: session.workspaceId,
      candidateId: session.candidateId,
      type: "erasure",
      status: "pending",
      requestedBy: session.email,
      notes: "Self-service request from an authenticated candidate portal session.",
    });
    return { ok: true, status: "pending" };
  } catch (error) {
    log.error(error, "requestPortalErasureAction failed");
    return { ok: false, error: t("erasureFailed") };
  }
}
