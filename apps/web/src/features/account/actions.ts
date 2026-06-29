"use server";

import { auth } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { db, schema } from "@harly/db";
import { eq } from "drizzle-orm";

const log = createLogger("account");

export async function updateUserProfileAction(data: {
  name: string;
  image?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  location?: string | null;
  bio?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
}) {
  const session = await auth.api.getSession({
    headers: await import("next/headers").then((h) => h.headers()),
  });
  if (!session?.user?.id) {
    return { success: false, error: "Not authenticated." } as const;
  }

  try {
    await db
      .update(schema.user)
      .set({
        name: data.name,
        image: data.image ?? null,
        jobTitle: data.jobTitle ?? null,
        phone: data.phone ?? null,
        location: data.location ?? null,
        bio: data.bio ?? null,
        linkedinUrl: data.linkedinUrl ?? null,
        githubUrl: data.githubUrl ?? null,
        websiteUrl: data.websiteUrl ?? null,
      })
      .where(eq(schema.user.id, session.user.id));

    return { success: true } as const;
  } catch (error) {
    log.error(error, "updateUserProfileAction failed");
    return {
      success: false,
      error: "Could not update profile. Some fields may not be available yet.",
    } as const;
  }
}
