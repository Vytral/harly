"use server";

import { cookies } from "next/headers";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { candidates, db } from "@harly/db";
import { PORTAL_SESSION_COOKIE, resolvePortalSession } from "@/lib/portal-auth";

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).optional().default(""),
  headline: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  location: z.string().trim().max(100).optional().nullable(),
  linkedinUrl: z.string().trim().url().max(500).optional().nullable().or(z.literal("")),
  githubUrl: z.string().trim().url().max(500).optional().nullable().or(z.literal("")),
  websiteUrl: z.string().trim().url().max(500).optional().nullable().or(z.literal("")),
});

export type UpdateProfileResult = { ok: true } | { ok: false; error: string };

export async function updatePortalProfileAction(
  input: unknown,
): Promise<UpdateProfileResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) return { ok: false, error: "Not signed in." };

  const session = await resolvePortalSession(token);
  if (!session) return { ok: false, error: "Session expired." };

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const d = parsed.data;

  await db
    .update(candidates)
    .set({
      firstName: d.firstName,
      lastName: d.lastName,
      headline: d.headline || null,
      phone: d.phone || null,
      location: d.location || null,
      linkedinUrl: d.linkedinUrl || null,
      githubUrl: d.githubUrl || null,
      websiteUrl: d.websiteUrl || null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(candidates.id, session.candidateId),
        eq(candidates.workspaceId, session.workspaceId),
      ),
    );

  return { ok: true };
}
