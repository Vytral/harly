"use server";

import { auth } from "@/lib/auth";
import { db, schema } from "@openhire/db";
import { eq } from "drizzle-orm";

export async function updateUserProfileAction(data: {
  name: string;
  image?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  location?: string | null;
  bio?: string | null;
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
      })
      .where(eq(schema.user.id, session.user.id));

    return { success: true } as const;
  } catch (error) {
    console.error("[updateUserProfileAction]", error);
    return {
      success: false,
      error: "Could not update profile. Some fields may not be available yet.",
    } as const;
  }
}
