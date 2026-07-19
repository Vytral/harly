"use server";

import { cookies } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";

import { candidates, db, dsarRequests } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";
import { createLogger } from "@/lib/logger";
import {
  isOwnedAvatarUrl,
  portalProfileSchema,
  type PortalProfileInput,
} from "./profile-validation";

const log = createLogger("portal-profile");

export async function updatePortalProfileAction(
  profile: PortalProfileInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const parsedProfile = portalProfileSchema.safeParse(profile);
    if (!parsedProfile.success) {
      return { ok: false, error: parsedProfile.error.issues[0]?.message ?? "Invalid profile details." };
    }
    const cookieStore = await cookies();
    const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    if (!token) return { ok: false, error: "Unauthorized." };

    const session = await resolvePortalSession(token);
    if (!session) return { ok: false, error: "Unauthorized." };

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
  key?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    if (!token) return { success: false, error: "Unauthorized." };

    const session = await resolvePortalSession(token);
    if (!session) return { success: false, error: "Unauthorized." };

    if (
      input.avatarUrl !== null &&
      !isOwnedAvatarUrl(session.workspaceId, input.key, input.avatarUrl)
    ) {
      return { success: false, error: "Use an image uploaded through this portal." };
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
      return { success: false, error: "Candidate not found." };
    }

    return { success: true };
  } catch (error) {
    log.error(error, "updatePortalCandidateAvatarAction failed");
    return { success: false, error: "Unable to update avatar." };
  }
}

/** Records a verified candidate's erasure request for staff review and fulfilment. */
export async function requestPortalErasureAction(): Promise<{
  ok: boolean;
  error?: string;
  status?: "pending" | "processing";
}> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
    const session = token ? await resolvePortalSession(token) : null;
    if (!session) return { ok: false, error: "Unauthorized." };

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
    return { ok: false, error: "Unable to submit deletion request." };
  }
}
