"use server";

import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";

import { candidates, db } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("portal-profile");

type ProfileData = {
  firstName: string;
  lastName: string | null;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  headline: string | null;
};

export async function updatePortalProfileAction(
  profile: ProfileData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    if (!token) return { ok: false, error: "Unauthorized." };

    const session = await resolvePortalSession(token);
    if (!session) return { ok: false, error: "Unauthorized." };

    const [candidate] = await db
      .update(candidates)
      .set({
        firstName: profile.firstName,
        lastName: profile.lastName ?? "",
        phone: profile.phone,
        location: profile.location,
        linkedinUrl: profile.linkedinUrl,
        githubUrl: profile.githubUrl,
        websiteUrl: profile.websiteUrl,
        headline: profile.headline,
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
      return { ok: false, error: "Candidate not found." };
    }

    return { ok: true };
  } catch (error) {
    log.error(error, "updatePortalProfileAction failed");
    return { ok: false, error: "Unable to update profile." };
  }
}

export async function updatePortalCandidateAvatarAction(input: {
  avatarUrl: string | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    if (!token) return { success: false, error: "Unauthorized." };

    const session = await resolvePortalSession(token);
    if (!session) return { success: false, error: "Unauthorized." };

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
      return { success: false, error: "Candidate not found." };
    }

    return { success: true };
  } catch (error) {
    log.error(error, "updatePortalCandidateAvatarAction failed");
    return { success: false, error: "Unable to update avatar." };
  }
}
